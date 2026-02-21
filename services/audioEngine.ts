
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
  
  // Track the latest requested URL to prevent race conditions during rapid skipping
  private nextTrackUrl: string | null = null;

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
            this.audioElement.play().catch(err => {
                 // Ignore interrupted errors here too
                 if (err.name !== 'AbortError' && !err.message?.includes('interrupted')) {
                     console.error("Retry playback failed", err);
                 }
            });
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
        latencyHint: 'playback', // Optimized for smooth continuous playback
        sampleRate: 44100
    });
    
    // Create Nodes
    try {
        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    } catch (e) {
        console.warn("Could not create MediaElementSource (likely CORS). Visualizer will be disabled.");
    }

    // 1. Panner (Spatial)
    // Optimized for Spatial Audio without volume loss
    this.pannerNode = this.audioContext.createPanner();
    this.pannerNode.panningModel = 'HRTF'; // High quality spatialization
    this.pannerNode.distanceModel = 'inverse';
    this.pannerNode.refDistance = 3; 
    this.pannerNode.rolloffFactor = 0.5; 
    this.pannerNode.coneInnerAngle = 360; 
    
    // 2. Pre-Amp Gain (Volume Boost)
    // REDUCED to 0.9 to prevent input clipping before compression
    this.preAmpGain = this.audioContext.createGain();
    this.preAmpGain.gain.value = 0.9; 

    // 3. High-Fidelity Compressor
    // Tuned for transparency and safety to prevent "ghizzing"/clipping 
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -30; // Start engaging earlier to catch sudden peaks
    this.compressorNode.knee.value = 35; // Soft knee for transparent transition
    this.compressorNode.ratio.value = 8; // Higher ratio to clamp down on distortion
    this.compressorNode.attack.value = 0.05; // Slower attack (50ms) to let punch through but stop sustained clipping
    this.compressorNode.release.value = 0.25; // Smooth release

    // 4. Master Gain (Volume Control)
    this.gainNode = this.audioContext.createGain();
    // Initialize silence
    this.gainNode.gain.value = 0;
    
    // 5. Analyser (Visualizer)
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.85; 

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

      // 2. Spatial Node (Bypass if OFF for purity)
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
      
      // Automatic Makeup Gain for Spatial Modes to maintain loudness
      if (this.currentMode !== 'off') {
          // Careful boost for 3D modes
          this.preAmpGain.gain.setTargetAtTime(1.2, this.audioContext.currentTime, 0.1); 
      } else {
          this.preAmpGain.gain.setTargetAtTime(0.9, this.audioContext.currentTime, 0.1);
      }
  }

  async loadTrack(url: string) {
    // Record this as the latest requested track
    this.nextTrackUrl = url;

    if (!this.audioContext) this.init();
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    // SMOOTH DREAMY FADE OUT
    // We use exponential ramp for a more natural volume drop
    if (this.gainNode && this.audioContext) {
         const currTime = this.audioContext.currentTime;
         this.gainNode.gain.cancelScheduledValues(currTime);
         this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currTime);
         
         // 600ms long smooth fade out to avoid abrupt cuts
         // Note: Exponential ramp cannot hit 0 exactly, so we go to 0.01 then set 0
         this.gainNode.gain.exponentialRampToValueAtTime(0.01, currTime + 0.6);
         this.gainNode.gain.setValueAtTime(0, currTime + 0.61);
         
         // Wait for fade
         await new Promise(r => setTimeout(r, 620));
    }

    // RACE CONDITION CHECK
    if (this.nextTrackUrl !== url) {
        return;
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
    
    // Wrap play in try/catch to handle "interrupted by new load request" error gracefully
    try {
        await this.audioElement.play();
    } catch (e: any) {
        if (e.name === 'AbortError' || e.message?.includes('interrupted')) {
            return;
        }
        console.error("Audio playback error:", e);
        return;
    }
    
    // SMOOTH DREAMY FADE IN
    // Use exponential ramp for that "immersive" start feel
    if (this.gainNode && this.audioContext) {
        const currTime = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(currTime);
        this.gainNode.gain.setValueAtTime(0.01, currTime); // Start slightly above 0 for exponential
        
        // 1.2 Second Fade In - Very cinematic
        this.gainNode.gain.exponentialRampToValueAtTime(1.0, currTime + 1.2);
    }
  }

  pause() {
    // Smooth fade out on pause
    if (this.gainNode && this.audioContext) {
        const currTime = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(currTime);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currTime);
        
        // 400ms fade out
        this.gainNode.gain.exponentialRampToValueAtTime(0.01, currTime + 0.4);
        this.gainNode.gain.setValueAtTime(0, currTime + 0.41);
        
        setTimeout(() => {
            this.audioElement.pause();
        }, 420);
    } else {
        this.audioElement.pause();
    }
  }

  setVolume(value: number) {
    // Volume control logic placeholder
  }

  seek(time: number) {
    if (isFinite(time)) {
        // Mute briefly during seek to prevent stutter sound
        if(this.gainNode && this.audioContext) {
            this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        }
        
        this.audioElement.currentTime = time;
        
        // Fade back in quickly
        if(this.gainNode && this.audioContext && !this.audioElement.paused) {
             this.gainNode.gain.linearRampToValueAtTime(1.0, this.audioContext.currentTime + 0.3);
        }
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
    if (this.currentMode === mode) return;
    
    this.currentMode = mode;
    if (mode === 'off' && this.pannerNode && this.audioContext) {
      // Reset position to center immediately using ramp for safety
      const t = this.audioContext.currentTime;
      this.pannerNode.positionX.linearRampToValueAtTime(0, t + 0.1);
      this.pannerNode.positionY.linearRampToValueAtTime(0, t + 0.1);
      this.pannerNode.positionZ.linearRampToValueAtTime(0, t + 0.1);
    }
    
    this.rebuildGraph(); 
  }

  setEQBand(index: number, gain: number) {
    if (this.eqNodes[index] && this.audioContext) {
       // Smooth transition for EQ changes
       this.eqNodes[index].gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.1);
    }
  }

  setEQGains(gains: number[]) {
      if(!this.audioContext) return;
      gains.forEach((gain, index) => {
          if (this.eqNodes[index]) {
              this.eqNodes[index].gain.setTargetAtTime(gain, this.audioContext!.currentTime, 0.2);
          }
      });
  }

  getAnalyser() {
    return this.analyserNode;
  }

  private startSpatialLoop() {
    // Cleanup existing
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.backgroundIntervalId) clearInterval(this.backgroundIntervalId);

    const updatePosition = () => {
       if (this.currentMode !== 'off' && this.pannerNode && this.audioContext && !this.audioElement.paused) {
        const time = this.audioContext.currentTime;
        
        let x = 0, y = 0, z = 0;
        
        if (this.currentMode === '8d') {
          // Period of ~8 seconds
          const speed = 0.5; 
          x = Math.sin(time * speed) * 3; 
          z = Math.cos(time * speed) * 3; 
          y = 0;
        } else if (this.currentMode === '16d') {
           const speed = 0.8;
           x = Math.sin(time * speed) * 6; // Wider
           z = Math.cos(time * speed) * 6;
           y = Math.sin(time * 0.3) * 3; // Vertical movement
        } else if (this.currentMode === '32d') {
           const speed = 1.1; // Faster
           x = Math.sin(time * speed) * 9; // Very wide
           z = Math.cos(time * speed * 0.9) * 9; // Async phase
           y = Math.cos(time * 0.5) * 5;
        }

        if (this.pannerNode.positionX) {
             // Use extremely short ramps instead of instant set to avoid zipper noise
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

    // 2. Backup interval for background tab
    this.backgroundIntervalId = setInterval(() => {
        if (document.hidden) {
            updatePosition();
        }
    }, 200); 
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
