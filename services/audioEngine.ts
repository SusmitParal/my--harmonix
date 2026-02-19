
import { SpatialMode, Song } from '../types';

class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private preAmpGain: GainNode | null = null; // New Pre-Amp for boost
  private compressorNode: DynamicsCompressorNode | null = null; // Compressor to stop distortion
  private pannerNode: PannerNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  
  private audioElement: HTMLAudioElement;
  private animationFrameId: number | null = null;
  private backgroundIntervalId: any = null;
  
  // Spatial config
  private currentMode: SpatialMode = 'off';

  // Callbacks for Media Session Actions
  private actionHandlers: {
      onPlay?: () => void;
      onPause?: () => void;
      onNext?: () => void;
      onPrev?: () => void;
  } = {};
  
  constructor() {
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous"; // Needed for Visualizer/EQ
    
    // BUFFERING & BACKGROUND OPTIMIZATIONS
    this.audioElement.preload = "auto"; // Preload as much as possible
    this.audioElement.setAttribute('playsinline', 'true'); // Helpful for mobile web
    // @ts-ignore - Non-standard safari property for background smoothness
    this.audioElement.setAttribute('x-webkit-airplay', 'allow');
    
    // Error handling: If CORS fails, retry without CORS so user still hears audio
    this.audioElement.onerror = (e) => {
        const src = this.audioElement.src;
        if (this.audioElement.crossOrigin === "anonymous" && src) {
            console.warn("Audio CORS failed. Retrying in playback-only mode (No Visualizer).");
            this.audioElement.crossOrigin = null; // Remove CORS requirement
            this.audioElement.src = src;
            this.audioElement.play().catch(err => console.error("Retry playback failed", err));
        }
    };

    // Ensure audio context resumes when screen wakes up
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.audioContext?.state === 'suspended') {
                this.audioContext.resume();
            }
        });
    }

    this.initMediaSession();
  }

  // --- MEDIA SESSION API ---
  private initMediaSession() {
      if ('mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', () => {
              this.play();
              this.actionHandlers.onPlay?.();
          });
          navigator.mediaSession.setActionHandler('pause', () => {
              this.pause();
              this.actionHandlers.onPause?.();
          });
          navigator.mediaSession.setActionHandler('previoustrack', () => {
              this.actionHandlers.onPrev?.();
          });
          navigator.mediaSession.setActionHandler('nexttrack', () => {
              this.actionHandlers.onNext?.();
          });
          navigator.mediaSession.setActionHandler('seekto', (details) => {
              if (details.seekTime !== undefined) {
                  this.seek(details.seekTime);
              }
          });
      }
  }

  setMediaSessionHandlers(handlers: { onPlay: () => void, onPause: () => void, onPrev: () => void, onNext: () => void }) {
      this.actionHandlers = handlers;
  }

  updateMediaSession(song: Song) {
      if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
              title: song.title,
              artist: song.artist,
              album: song.album,
              artwork: [
                  { src: song.coverUrl, sizes: '96x96', type: 'image/jpeg' },
                  { src: song.coverUrl, sizes: '128x128', type: 'image/jpeg' },
                  { src: song.coverUrl, sizes: '192x192', type: 'image/jpeg' },
                  { src: song.coverUrl, sizes: '256x256', type: 'image/jpeg' },
                  { src: song.coverUrl, sizes: '384x384', type: 'image/jpeg' },
                  { src: song.coverUrl, sizes: '512x512', type: 'image/jpeg' },
              ]
          });
      }
  }

  init() {
    if (this.audioContext) {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return;
    }
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({
        latencyHint: 'playback', // Optimization: prefers smooth playback over low latency
        sampleRate: 44100 // Standardize
    });
    
    // Create Nodes
    try {
        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    } catch (e) {
        console.warn("Could not create MediaElementSource (likely CORS). Visualizer will be disabled.");
    }

    // 1. Panner (Spatial)
    this.pannerNode = this.audioContext.createPanner();
    this.pannerNode.panningModel = 'HRTF'; // High quality spatialization
    this.pannerNode.distanceModel = 'inverse';

    // 2. Pre-Amp Gain (Volume Boost)
    // We set this > 1.0 to increase volume beyond standard 100%
    this.preAmpGain = this.audioContext.createGain();
    this.preAmpGain.gain.value = 1.0; // Start at 1.0 to avoid burst

    // 3. Compressor (Safety to prevent clipping/distortion from boost)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -12; // Start compressing at -12dB
    this.compressorNode.knee.value = 30; // Soft knee
    this.compressorNode.ratio.value = 12; // High compression ratio
    this.compressorNode.attack.value = 0.003; // Fast attack
    this.compressorNode.release.value = 0.25; // Moderate release

    // 4. Master Gain (Volume Control)
    this.gainNode = this.audioContext.createGain();
    
    // 5. Analyser (Visualizer)
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.8; // Smoother visualizer

    // Create 6-band EQ
    const eqFreqs = [60, 200, 500, 1000, 4000, 10000];
    this.eqNodes = eqFreqs.map(freq => {
      const node = this.audioContext!.createBiquadFilter();
      node.type = 'peaking';
      node.frequency.value = freq;
      node.Q.value = 1;
      return node;
    });

    this.rebuildGraph();
    this.startSpatialLoop();
  }

  // Reconnects nodes based on current settings
  private rebuildGraph() {
      if (!this.sourceNode || !this.audioContext || !this.pannerNode || !this.preAmpGain || !this.compressorNode || !this.gainNode || !this.analyserNode) return;

      // Disconnect everything
      this.sourceNode.disconnect();
      this.eqNodes.forEach(n => n.disconnect());
      this.pannerNode.disconnect();
      this.preAmpGain.disconnect();
      this.compressorNode.disconnect();
      this.gainNode.disconnect();
      this.analyserNode.disconnect();

      // Start Chain
      let currentNode: AudioNode = this.sourceNode;

      // 1. EQ Chain (Always active)
      this.eqNodes.forEach(node => {
          currentNode.connect(node);
          currentNode = node;
      });

      // 2. Spatial Node (Bypass if OFF for performance smoothness)
      if (this.currentMode !== 'off') {
          currentNode.connect(this.pannerNode);
          currentNode = this.pannerNode;
      }

      // 3. Dynamics Chain
      currentNode.connect(this.preAmpGain);
      this.preAmpGain.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      
      // 4. Output
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);
  }

  async loadTrack(url: string) {
    // SMART TRANSITION: Smooth Fade Out
    if (this.audioContext && this.gainNode && !this.audioElement.paused && !this.audioElement.ended) {
         try {
             const currTime = this.audioContext.currentTime;
             this.gainNode.gain.cancelScheduledValues(currTime);
             this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currTime);
             this.gainNode.gain.linearRampToValueAtTime(0.01, currTime + 0.3); // Slower fade out (300ms)
             await new Promise(r => setTimeout(r, 300));
         } catch (e) {
             // Ignore
         }
    }

    if (!this.audioContext) this.init();
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Reset volume for new track (Prepare for Fade In)
    if (this.gainNode && this.audioContext) {
        this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.gainNode.gain.setValueAtTime(0.01, this.audioContext.currentTime); // Start silent
    }

    // Reset to anonymous for each new track to try and get Visualizer working
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.src = url;
    this.audioElement.load();
  }

  async play() {
    if (!this.audioContext) this.init();
    if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
    }
    
    const playPromise = this.audioElement.play();
    
    // Smooth Fade In
    if (this.gainNode && this.audioContext) {
        const currTime = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(currTime);
        this.gainNode.gain.setValueAtTime(0.01, currTime);
        this.gainNode.gain.exponentialRampToValueAtTime(1.0, currTime + 0.8); // 800ms Fade In
    }
    
    return playPromise;
  }

  pause() {
    // Smooth fade out on pause
    if (this.gainNode && this.audioContext) {
        const currTime = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(currTime);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currTime);
        this.gainNode.gain.linearRampToValueAtTime(0.01, currTime + 0.2);
        
        setTimeout(() => {
            this.audioElement.pause();
            // Reset gain for next play
            if(this.gainNode && this.audioContext) {
                 this.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
            }
        }, 200);
    } else {
        this.audioElement.pause();
    }
  }

  setVolume(value: number) {
    if (this.preAmpGain) {
      // Use preAmp for volume to allow boosting up to 160%
      // Value 0-1 mapped to 0-1.6
      this.preAmpGain.gain.value = value * 1.6;
    }
  }

  seek(time: number) {
    if (isFinite(time)) {
        this.audioElement.currentTime = time;
    }
  }

  get currentTime() {
    return this.audioElement.currentTime;
  }

  get duration() {
    return this.audioElement.duration || 0;
  }

  getMode(): SpatialMode {
      return this.currentMode;
  }

  setSpatialMode(mode: SpatialMode) {
    this.currentMode = mode;
    if (mode === 'off' && this.pannerNode) {
      this.pannerNode.positionX.value = 0;
      this.pannerNode.positionY.value = 0;
      this.pannerNode.positionZ.value = 0;
    }
    this.rebuildGraph(); // Reconfigure path for performance
  }

  setEQBand(index: number, gain: number) {
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.value = gain;
    }
  }

  getAnalyser() {
    return this.analyserNode;
  }

  private startSpatialLoop() {
    // We use a dual approach: requestAnimationFrame for smooth visuals when active,
    // and a setInterval backup to ensure spatial positions update (even if jerkily) in background.
    
    // Cleanup existing
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.backgroundIntervalId) clearInterval(this.backgroundIntervalId);

    const updatePosition = () => {
       if (this.currentMode !== 'off' && this.pannerNode && this.audioContext && !this.audioElement.paused) {
        const time = this.audioContext.currentTime;
        
        let x = 0, y = 0, z = 0;
        
        // 8D: Simple Circle around head
        // 16D: Circle + moving up and down slightly (Helix)
        // 32D: Faster, wider, more chaotic
        
        if (this.currentMode === '8d') {
          // Period of ~8 seconds
          const speed = 0.8; 
          x = Math.sin(time * speed) * 3; // 3 units away
          z = Math.cos(time * speed) * 3; 
          y = 0;
        } else if (this.currentMode === '16d') {
           const speed = 1.2;
           x = Math.sin(time * speed) * 5;
           z = Math.cos(time * speed) * 5;
           y = Math.sin(time * 0.5) * 2; // Up and down
        } else if (this.currentMode === '32d') {
           const speed = 2.0;
           x = Math.sin(time * speed) * 8;
           z = Math.cos(time * speed * 1.1) * 8; // Slightly out of phase for chaos
           y = Math.cos(time * 1.5) * 4;
        }

        // Apply position
        if (this.pannerNode.positionX) {
             this.pannerNode.positionX.setValueAtTime(x, time);
             this.pannerNode.positionY.setValueAtTime(y, time);
             this.pannerNode.positionZ.setValueAtTime(z, time);
        }
      }
    };

    // 1. High refresh rate loop for active tab
    const loop = () => {
      updatePosition();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();

    // 2. Backup interval for background tab (runs approx once per sec when backgrounded)
    // This ensures that even if requestAnimationFrame stops, position roughly updates so it doesn't get "stuck" in one ear.
    this.backgroundIntervalId = setInterval(() => {
        if (document.hidden) {
            updatePosition();
        }
    }, 500);
  }

  // Events
  onTimeUpdate(callback: () => void) {
    this.audioElement.addEventListener('timeupdate', callback);
  }
  
  onEnded(callback: () => void) {
    this.audioElement.addEventListener('ended', callback);
  }
}

export const audioEngine = new AudioEngine();
