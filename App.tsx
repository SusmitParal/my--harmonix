import React, { Component, useState, useEffect, useRef, ReactNode } from 'react';
import { 
  Home as HomeIcon, Search as SearchIcon, Heart, 
  Settings, User, Download, Menu, X, Bell, Moon, Sun, Users, Smartphone as PhoneIcon,
  ListMusic, ListPlus, Trash2, Play, RefreshCw, LogOut, Music2, FolderHeart, Shuffle, AlertTriangle
} from 'lucide-react';
import { Song, Playlist, ViewState, SpatialMode, ShuffleMode, RepeatMode, UserProfile } from './types';
import { DEMO_TRACK_URL, MOCK_PLAYLISTS, GENRES } from './constants';
import { audioEngine } from './services/audioEngine';
import { getHomeMixes, searchTracks, getDiscoverMix } from './services/musicApi';
import { smartReorderQueue, generateVibeQuery } from './services/geminiService';

import { PlayerBar } from './components/PlayerBar';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { Visualizer } from './components/Visualizer';
import { QueueDrawer } from './components/QueueDrawer';
import { ArtistModal } from './components/ArtistModal';
import { PlaylistModal } from './components/PlaylistModal';
import { SplashScreen } from './components/SplashScreen';
import { Onboarding } from './components/Onboarding';

// Bump version to force a cleanup of old corrupted localStorage data
const APP_VERSION = '3.9.0';

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0f0518] text-white p-6 text-center z-[9999] relative">
            <AlertTriangle size={64} className="text-[#d946ef] mb-6 animate-pulse" />
            <h1 className="text-2xl font-bold text-white mb-2">Neon Glitch Detected</h1>
            <p className="mb-8 text-gray-400 max-w-xs">The vibe got too intense. Reset the app to clear the interference.</p>
            <button 
                onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                }}
                className="px-8 py-4 bg-gradient-to-r from-[#d946ef] to-[#22d3ee] rounded-full font-bold text-white shadow-[0_0_20px_rgba(217,70,239,0.5)] hover:scale-105 transition"
            >
                Reset System
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [view, setView] = useState<ViewState>('home');
  const [queue, setQueue] = useState<Song[]>([]);
  // History stack for "Previous" functionality
  const [history, setHistory] = useState<Song[]>([]);
  
  // Playback Control States
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('off');
  // Initialize from localStorage
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
      try {
          return (localStorage.getItem('repeatMode') as RepeatMode) || 'off';
      } catch {
          return 'off';
      }
  });
  
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]); // To restore order when shuffle off

  // State
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>(MOCK_PLAYLISTS);
  const [showQueue, setShowQueue] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notification, setNotification] = useState<string | null>(null);
  
  // Settings State
  const [defaultSpatial, setDefaultSpatial] = useState<SpatialMode>('off');
  
  // Play Together State
  const [connectedDevices, setConnectedDevices] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Playlist Modal State
  const [playlistModalSong, setPlaylistModalSong] = useState<Song | null>(null);

  // Play Selection Modal (Shuffle vs Normal)
  const [playSelection, setPlaySelection] = useState<{title: string, songs: Song[]} | null>(null);

  // Home Content
  const [homeMixes, setHomeMixes] = useState<{title: string, songs: Song[]}[]>([]);
  const sleepTimerRef = useRef<number | null>(null);

  // --- VERSION CHECK & INITIALIZATION SEQUENCE ---
  
  // 1. Version Check & Safe Data Loading
  useEffect(() => {
      // Check version to prevent stale data crashes
      const currentVersion = localStorage.getItem('app_version');
      if (currentVersion !== APP_VERSION) {
          console.log(`Version mismatch (Old: ${currentVersion}, New: ${APP_VERSION}). Clearing critical storage.`);
          // Clear potentially corrupt playback state
          localStorage.removeItem('omni_last_song');
          localStorage.removeItem('omni_last_queue');
          localStorage.setItem('app_version', APP_VERSION);
      }

      // Safe Data Restoration
      try {
        const storedProfile = localStorage.getItem('harmonix_user_profile');
        if (storedProfile) setUserProfile(JSON.parse(storedProfile));
        
        const lastLiked = localStorage.getItem('omni_liked_songs');
        if (lastLiked) setLikedSongs(JSON.parse(lastLiked));

        const lastPlaylists = localStorage.getItem('omni_playlists');
        if (lastPlaylists) setPlaylists(JSON.parse(lastPlaylists));

        // Song Restoration
        const lastSong = localStorage.getItem('omni_last_song');
        const lastTime = localStorage.getItem('omni_last_time');
        const lastQueue = localStorage.getItem('omni_last_queue');
        
        if (lastSong) {
            const song = JSON.parse(lastSong);
            const queueSaved = lastQueue ? JSON.parse(lastQueue) : [];
            
            setCurrentSong(song);
            setQueue(queueSaved);
            if (queueSaved.length > 0) setOriginalQueue(queueSaved);

            // Important: Don't await this, let it happen in background
            const url = song.audioUrl || song.previewUrl || DEMO_TRACK_URL;
            audioEngine.loadTrack(url).then(() => {
                if (lastTime) {
                    const t = parseFloat(lastTime);
                    if (!isNaN(t)) audioEngine.seek(t);
                }
            }).catch(e => console.warn("Background audio load failed", e));

            audioEngine.updateMediaSession(song);
        }
      } catch (e) {
          console.error("Initialization Error", e);
          // Fallback: Clear potentially corrupt data
          localStorage.removeItem('omni_last_song');
      }
  }, []);

  // 2. Safety Timeout for Splash Screen (Prevent Purple Screen of Death)
  useEffect(() => {
      const safetyTimer = setTimeout(() => {
          if (showSplash) {
             console.warn("Splash screen timed out, forcing close.");
             handleSplashComplete();
          }
      }, 4000); 
      return () => clearTimeout(safetyTimer);
  }, [showSplash]);


  // 3. Handle Splash Completion logic
  const handleSplashComplete = () => {
      setShowSplash(false);
      // If no profile, show onboarding
      if (!userProfile && !localStorage.getItem('harmonix_user_profile')) {
          setShowOnboarding(true);
      } else {
          // If profile exists (or loaded), fetch mixes
          loadHomeMixes(userProfile);
      }
  };

  const handleOnboardingComplete = (profile: UserProfile) => {
      setUserProfile(profile);
      localStorage.setItem('harmonix_user_profile', JSON.stringify(profile));
      setShowOnboarding(false);
      loadHomeMixes(profile);
      showNotification(`Welcome to Harmonix, ${profile.name}!`);
  };

  const loadHomeMixes = async (profile: UserProfile | null) => {
      try {
        const mixes = await getHomeMixes(profile || undefined);
        setHomeMixes(mixes);
      } catch (e) {
          console.error("Failed to load mixes", e);
      }
  };

  // 4. Reset App Data (Simulate Reinstall)
  const resetApp = () => {
      if (confirm("Reset App? This will clear your profile and data, simulating a fresh install.")) {
          localStorage.clear();
          window.location.reload();
      }
  };

  // --- AUTO DISCOVERY ENGINE ---
  useEffect(() => {
    const interval = setInterval(async () => {
        try {
            // Fetch a random new mix
            const newMix = await getDiscoverMix(userProfile || undefined);
            
            if (newMix.songs.length > 0) {
                setHomeMixes(prev => {
                    // Prevent exact duplicates by title
                    if (prev.some(p => p.title === newMix.title)) return prev;
                    // Add to TOP of list
                    return [newMix, ...prev];
                });
                // Only show notification if user is on home screen to avoid annoyance
                if (view === 'home' && !showSplash && !showOnboarding) {
                    showNotification(`⚡ New Drop: ${newMix.title}`);
                }
            }
        } catch (e) {
            // Silent fail
        }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [view, showSplash, showOnboarding, userProfile]);

  // --- Persistence Logic ---
  // Save state on change
  useEffect(() => {
      try {
          if (currentSong) {
              localStorage.setItem('omni_last_song', JSON.stringify(currentSong));
              localStorage.setItem('omni_last_queue', JSON.stringify(queue));
              localStorage.setItem('omni_history', JSON.stringify(history));
          }
          localStorage.setItem('omni_liked_songs', JSON.stringify(likedSongs));
          localStorage.setItem('omni_playlists', JSON.stringify(playlists));
      } catch (e) {
          console.warn("Storage full or error", e);
      }
  }, [currentSong, queue, likedSongs, history, playlists]);

  // Save time periodically
  useEffect(() => {
      const interval = setInterval(() => {
          if (isPlaying) {
             localStorage.setItem('omni_last_time', audioEngine.currentTime.toString());
          }
      }, 3000);
      return () => clearInterval(interval);
  }, [isPlaying]);

  // Persist Repeat Mode
  useEffect(() => {
      localStorage.setItem('repeatMode', repeatMode);
  }, [repeatMode]);

  // Handle Song Ending (Stale Closure Fix)
  const handleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
      const onEnd = () => {
          handleNextRef.current();
      };
      audioEngine.onEnded(onEnd);
      return () => {
          // cleanup
      };
  }, []);

  // Sleep Timer
  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepTimer) {
        sleepTimerRef.current = window.setTimeout(() => {
            audioEngine.pause();
            setIsPlaying(false);
            setSleepTimer(null);
            showNotification("Sleep Timer: Playback stopped.");
        }, sleepTimer * 60 * 1000);
    }
    return () => {
        if(sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [sleepTimer]);

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  // Internal helper to play
  const playSongInternal = async (song: Song) => {
      setCurrentSong(song);
      
      // 1. Update Media Session Metadata (Notification Bar)
      audioEngine.updateMediaSession(song);

      // 2. Load Track
      const url = song.audioUrl || song.previewUrl || DEMO_TRACK_URL;
      await audioEngine.loadTrack(url);
      
      // 3. Play
      try {
        await audioEngine.play();
        setIsPlaying(true);
      } catch (e) {
          console.error("Playback failed", e);
      }
  }

  const playSong = async (song: Song, addToHistory = true) => {
    if (currentSong && addToHistory) {
        setHistory(prev => [...prev, currentSong]);
    }
    await playSongInternal(song);
  };

  // Play Logic specifically for the modal options
  const handleSmartPlay = (songs: Song[], mode: 'normal' | 'shuffle') => {
    if (songs.length === 0) return;
    
    // Reset any previous queue
    setQueue([]);
    
    if (mode === 'shuffle') {
        const shuffled = [...songs].sort(() => Math.random() - 0.5);
        setShuffleMode('normal');
        setQueue(shuffled.slice(1));
        setOriginalQueue(songs); // Keep original order for "Shuffle Off" logic
        playSong(shuffled[0]);
        showNotification("Playing Shuffled");
    } else {
        setShuffleMode('off');
        setQueue(songs.slice(1));
        setOriginalQueue(songs);
        playSong(songs[0]);
        showNotification("Playing Normal");
    }
  };

  // Legacy helper - redirects to modal logic if needed or direct play
  const playFromList = async (song: Song, list: Song[]) => {
      const idx = list.findIndex(s => s.id === song.id);
      if (idx !== -1) {
          const nextSongs = list.slice(idx + 1);
          setQueue(nextSongs);
          setOriginalQueue(list); 
      }
      await playSong(song);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      audioEngine.pause();
      localStorage.setItem('omni_last_time', audioEngine.currentTime.toString());
    } else {
      audioEngine.play();
    }
    setIsPlaying(!isPlaying);
  };

  // --- Shuffle & Repeat Logic ---
  const toggleShuffle = async () => {
      let newMode: ShuffleMode = 'off';
      if (shuffleMode === 'off') newMode = 'normal';
      else if (shuffleMode === 'normal') newMode = 'ai';
      else newMode = 'off';
      
      setShuffleMode(newMode);
      
      if (newMode === 'off') {
          if (originalQueue.length > 0) setQueue(originalQueue);
          showNotification("Shuffle Off");
      } else if (newMode === 'normal') {
          if (originalQueue.length === 0 && queue.length > 0) setOriginalQueue([...queue]);
          setQueue(prev => [...prev].sort(() => Math.random() - 0.5));
          showNotification("Shuffle On");
      } else if (newMode === 'ai') {
          showNotification("AI Shuffle: Analyzing Vibe...");
          if (currentSong && queue.length > 0) {
              if (originalQueue.length === 0) setOriginalQueue([...queue]);
              const sorted = await smartReorderQueue(currentSong, queue);
              setQueue(sorted);
              showNotification("Queue optimized by AI");
          } else {
              setShuffleMode('normal');
              showNotification("Using Normal Shuffle");
          }
      }
  };

  const toggleRepeat = () => {
      let newMode: RepeatMode = 'off';
      if (repeatMode === 'off') newMode = 'all';
      else if (repeatMode === 'all') newMode = 'one';
      else newMode = 'off';
      
      setRepeatMode(newMode);
      showNotification(`Repeat: ${newMode === 'one' ? 'One Song' : newMode === 'all' ? 'All' : 'Off'}`);
  };

  // --- INTELLIGENT AUTOPLAY LOGIC ---
  const handleNext = async () => {
    if (repeatMode === 'one' && currentSong) {
        audioEngine.seek(0);
        audioEngine.play();
        return;
    }

    if (queue.length > 0) {
       const next = queue[0];
       setQueue(prev => prev.slice(1));
       playSong(next, true); 
    } else {
        if (repeatMode === 'all' && originalQueue.length > 0) {
            const resetQueue = [...originalQueue];
            const next = resetQueue[0];
            setQueue(resetQueue.slice(1));
            playSong(next, true); 
            showNotification("Playlist restarting...");
        } else if (currentSong) {
             showNotification("Autoplay: Loading...");
             try {
                const preferredLangs = userProfile?.languages || ['Hindi', 'English'];
                const vibeQuery = await generateVibeQuery(currentSong, preferredLangs);
                let similarSongs = await searchTracks(vibeQuery);
                similarSongs = similarSongs.filter(s => s.id !== currentSong.id && s.title !== currentSong.title);
                
                if (similarSongs.length === 0) {
                     const query = `${currentSong.artist} similar`;
                     similarSongs = await searchTracks(query);
                     similarSongs = similarSongs.filter(s => s.id !== currentSong.id);
                }
                
                if (similarSongs.length > 0) {
                     const next = similarSongs[0];
                     const rest = similarSongs.slice(1);
                     setQueue(rest);
                     playSong(next, true);
                } else {
                    audioEngine.seek(0);
                    audioEngine.play(); 
                    showNotification("Replaying current song");
                }
             } catch (e) {
                 audioEngine.seek(0);
                 audioEngine.play();
             }
        }
    }
  };

  useEffect(() => {
      handleNextRef.current = handleNext;
  }, [handleNext, repeatMode, queue, currentSong, originalQueue, userProfile]);

  const handlePrev = () => {
     if (audioEngine.currentTime > 3) {
         audioEngine.seek(0);
     } else if (history.length > 0) {
         const prevSong = history[history.length - 1];
         setHistory(prev => prev.slice(0, -1));
         if (currentSong) setQueue(q => [currentSong, ...q]);
         playSongInternal(prevSong);
     } else {
         audioEngine.seek(0);
     }
  };

  const handlePrevRef = useRef<() => void>(() => {});
  useEffect(() => { handlePrevRef.current = handlePrev; }, [handlePrev]);

  useEffect(() => {
      audioEngine.setMediaSessionHandlers({
          onPlay: () => { setIsPlaying(true); },
          onPause: () => { setIsPlaying(false); },
          onNext: () => { handleNextRef.current(); },
          onPrev: () => { handlePrevRef.current(); }
      });
  }, []);

  const handleAddToQueue = (song: Song, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setQueue(prev => {
          const newQ = [...prev, song];
          if (originalQueue.length === 0) setOriginalQueue(newQ);
          else setOriginalQueue(prevO => [...prevO, song]);
          return newQ;
      });
      showNotification(`Added "${song.title}" to queue`);
  };

  useEffect(() => {
     const delayDebounceFn = setTimeout(async () => {
       if (searchQuery && view === 'search') {
         setIsSearching(true);
         const results = await searchTracks(searchQuery);
         setSearchResults(results);
         setIsSearching(false);
       }
     }, 400);
     return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, view]);

  const toggleLike = () => {
    if (!currentSong) return;
    const exists = likedSongs.find(s => s.id === currentSong.id);
    if (exists) {
        setLikedSongs(prev => prev.filter(s => s.id !== currentSong.id));
    } else {
        setLikedSongs(prev => [currentSong, ...prev]);
    }
  };

  const connectDevices = () => {
      setIsScanning(true);
      setTimeout(() => {
          setConnectedDevices(['iPhone 14 Pro', 'Samsung S23', 'Pixel 8', 'iPad Air', 'MacBook Pro']);
          setIsScanning(false);
          showNotification("5 Devices Connected Successfully");
      }, 3000);
  };

  const setAsRingtone = () => {
      if (!currentSong) {
          showNotification("No song playing");
          return;
      }
      showNotification(`"${currentSong.title}" set as Ringtone`);
      setIsMenuOpen(false);
  };

  const handleAddToPlaylist = (playlistId: string) => {
    if (!playlistModalSong) return;
    setPlaylists(prev => prev.map(pl => {
        if (pl.id === playlistId) {
            return { ...pl, songs: [...pl.songs, playlistModalSong], coverUrl: playlistModalSong.coverUrl || pl.coverUrl };
        }
        return pl;
    }));
    setPlaylistModalSong(null);
    showNotification(`Added to playlist`);
  };

  const handleCreatePlaylist = (name: string) => {
    if (!playlistModalSong) return;
    const newPl: Playlist = {
        id: `pl_${Date.now()}`,
        name,
        description: 'Custom Playlist',
        coverUrl: playlistModalSong.coverUrl,
        songs: [playlistModalSong]
    };
    setPlaylists(prev => [newPl, ...prev]);
    setPlaylistModalSong(null);
    showNotification(`Created playlist "${name}"`);
  };

  const deletePlaylist = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm("Delete this playlist?")) {
          setPlaylists(prev => prev.filter(p => p.id !== id));
      }
  }

  // Styles
  const bgClass = theme === 'dark' ? 'bg-[#0f0518] text-white' : 'bg-gray-100 text-gray-900';
  const drawerClass = theme === 'dark' ? 'bg-[#150620] border-[#331144]' : 'bg-white border-gray-200';
  const headerClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const cardClass = theme === 'dark' ? 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#d946ef] backdrop-blur-md shadow-lg hover:shadow-[0_0_15px_rgba(217,70,239,0.3)]' : 'bg-white hover:bg-gray-5 shadow-md border-gray-200';
  const textSecondary = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const neonCyan = "text-[#22d3ee]"; 

  return (
    <>
    {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    
    {/* PLAY SELECTION MODAL */}
    {playSelection && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#181818] p-6 rounded-2xl w-80 shadow-2xl border border-gray-700 relative">
                <h3 className="text-xl font-bold text-white mb-2 truncate">Play {playSelection.title}</h3>
                <p className="text-gray-400 text-sm mb-6">How would you like to listen?</p>
                <div className="space-y-3">
                    <button 
                        onClick={() => {
                            handleSmartPlay(playSelection.songs, 'normal');
                            setPlaySelection(null);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/10 hover:bg-white/20 transition text-white font-medium group"
                    >
                        <Play size={20} className="text-[#22d3ee] group-hover:fill-current" /> Normal Play
                    </button>
                    <button 
                         onClick={() => {
                            handleSmartPlay(playSelection.songs, 'shuffle');
                            setPlaySelection(null);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#d946ef] to-[#22d3ee] text-white font-bold shadow-lg hover:scale-105 transition"
                    >
                        <Shuffle size={20} /> Shuffle Play
                    </button>
                </div>
                <button onClick={() => setPlaySelection(null)} className="mt-6 text-xs text-gray-500 w-full text-center hover:text-white uppercase tracking-widest">Cancel</button>
            </div>
        </div>
    )}
    
    <div className={`flex flex-col h-screen ${bgClass} overflow-hidden relative font-sans transition-colors duration-300 selection:bg-[#d946ef] selection:text-white`}>
      {theme === 'dark' && (
          <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_top_right,_#4a044e_0%,_transparent_40%),radial-gradient(circle_at_bottom_left,_#0e7490_0%,_transparent_40%)] opacity-60"></div>
      )}

      <div className={theme === 'light' ? 'opacity-10' : 'opacity-100'}>
        <Visualizer />
      </div>

      {notification && (
          <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-[#d946ef] to-[#22d3ee] text-white px-6 py-2 rounded-full shadow-[0_0_20px_rgba(217,70,239,0.5)] z-[70] font-bold animate-in fade-in slide-in-from-top-4 border border-white/20 whitespace-nowrap">
              {notification}
          </div>
      )}
      
      <header className={`absolute top-0 left-0 right-0 h-16 z-50 px-4 flex justify-between items-center ${theme === 'dark' ? 'bg-[#0f0518]/70' : 'bg-white/80'} backdrop-blur-xl border-b ${theme === 'dark' ? 'border-[#d946ef]/20' : 'border-black/5'}`}>
          <button onClick={() => setIsMenuOpen(true)} className="p-2 rounded-full hover:bg-white/10 transition">
              <Menu size={28} className={headerClass} />
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#d946ef] via-[#e879f9] to-[#22d3ee] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(217,70,239,0.5)] tracking-tight">Harmonix</h1>
            <p className={`text-[8px] ${textSecondary} tracking-[0.3em] uppercase text-[#22d3ee] drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]`}>Neon Spatial 32D</p>
          </div>
          <div 
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#d946ef] to-[#22d3ee] flex items-center justify-center font-bold text-white cursor-pointer shadow-[0_0_10px_#d946ef] hover:scale-105 transition border border-white/20"
            onClick={() => setView('profile')}
          >
            {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
          </div>
      </header>

      <div className="flex-1 overflow-y-auto pt-20 pb-48 z-10 scroll-smooth">
             {view === 'home' && (
               <div className="p-4 md:p-8 space-y-10">
                  {userProfile && (
                      <div className="mb-[-20px] animate-in fade-in slide-in-from-top-4 duration-700">
                          <h2 className="text-3xl font-bold text-white">
                              Hello, <span className="text-[#22d3ee]">{userProfile.name.split(' ')[0]}</span> 👋
                          </h2>
                          <p className="text-gray-400 text-sm mt-1">Ready for your daily vibe?</p>
                      </div>
                  )}

                  {homeMixes.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-64 space-y-4">
                          <div className="w-12 h-12 border-4 border-[#d946ef] border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-[#22d3ee] font-medium tracking-wide animate-pulse">Initializing Neon Waves...</p>
                      </div>
                  )}

                  {homeMixes.map((mix, idx) => (
                    <section key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="flex items-center justify-between mb-4 px-1">
                          <h2 className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-tight`}>{mix.title}</h2>
                          <span className="text-xs text-[#d946ef] uppercase tracking-wider font-bold cursor-pointer hover:text-[#22d3ee] transition-colors drop-shadow-[0_0_5px_rgba(217,70,239,0.5)]">View All</span>
                      </div>
                      
                      <div className="flex overflow-x-auto gap-5 pb-6 scrollbar-hide snap-x px-1">
                        {mix.songs.map(song => (
                          <div 
                            key={song.id} 
                            onClick={() => { playSong(song); }}
                            className={`min-w-[160px] w-[160px] ${cardClass} p-3 rounded-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer snap-start group border relative`}
                          >
                            <div className="relative mb-3 aspect-square overflow-hidden rounded-xl shadow-lg">
                               <img src={song.coverUrl} className="w-full h-full object-cover transition duration-500 group-hover:scale-110 group-hover:rotate-1" alt="" />
                               
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-2">
                                   <div className="flex justify-between w-full">
                                       <button 
                                          onClick={(e) => { e.stopPropagation(); setPlaylistModalSong(song); }}
                                          className="bg-black/60 hover:bg-[#d946ef] text-white rounded-full p-2 transition-all hover:scale-110 backdrop-blur-sm"
                                          title="Add to Playlist"
                                       >
                                          <ListMusic size={14} />
                                       </button>
                                       <button 
                                          onClick={(e) => handleAddToQueue(song, e)}
                                          className="bg-black/60 hover:bg-[#22d3ee] text-white rounded-full p-2 transition-all hover:scale-110 backdrop-blur-sm"
                                          title="Add to Queue"
                                       >
                                          <ListPlus size={14} />
                                       </button>
                                   </div>
                               </div>

                               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 pointer-events-none">
                                   <div className="bg-[#d946ef]/90 rounded-full p-3 shadow-[0_0_20px_#d946ef] backdrop-blur-sm">
                                       <Play size={20} fill="white" className="ml-1 text-white" />
                                   </div>
                               </div>
                            </div>
                            <h3 className={`font-bold text-sm truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-1 group-hover:text-[#d946ef] transition-colors`}>{song.title}</h3>
                            <p 
                                className={`text-[11px] ${textSecondary} truncate hover:text-[#22d3ee] transition-colors font-medium`}
                                onClick={(e) => {e.stopPropagation(); setSelectedArtist(song.artist)}}
                            >
                                {song.artist}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
               </div>
             )}
             
             {view === 'search' && (
               <div className="p-4 md:p-8 min-h-full">
                  <div className="relative group mb-6">
                      <SearchIcon className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-[#d946ef] transition-colors" size={20} />
                      <input 
                        type="text" 
                        placeholder="Search songs, artists..." 
                        className={`w-full ${theme === 'dark' ? 'bg-[#1a0925]/80 text-white border-white/10' : 'bg-white text-gray-900 border-gray-300'} border rounded-full py-3 pl-12 pr-6 text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#d946ef] focus:border-transparent transition-all shadow-lg placeholder:text-gray-500 backdrop-blur-md`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                  </div>

                  {!searchQuery && (
                    <div className="mt-8">
                        <h2 className={`font-bold text-xl mb-5 ${headerClass} tracking-tight`}>Browse Vibes</h2>
                        <div className="grid grid-cols-2 gap-4">
                        {GENRES.map((genre, i) => (
                            <div 
                                key={genre} 
                                onClick={() => {setSearchQuery(genre)}}
                                className={`h-24 rounded-2xl p-4 relative overflow-hidden cursor-pointer active:scale-95 transition bg-gradient-to-br ${i % 2 === 0 ? 'from-[#4a044e] to-[#9d174d]' : 'from-[#0e7490] to-[#155e75]'} shadow-lg text-white border border-white/10 group hover:shadow-[0_0_15px_rgba(217,70,239,0.4)]`}
                            >
                            <span className="font-bold text-lg group-hover:scale-110 transition-transform block drop-shadow-md z-10 relative">{genre}</span>
                            <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white/20 rounded-full blur-xl group-hover:bg-white/30 transition-colors"></div>
                            </div>
                        ))}
                        </div>
                    </div>
                  )}

                  {isSearching && (
                     <div className="flex justify-center mt-20">
                         <div className="w-12 h-12 border-4 border-[#22d3ee] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_#22d3ee]"></div>
                     </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-3 mt-4">
                        {searchResults.map(song => (
                          <div 
                             key={song.id} 
                             onClick={() => { playSong(song); }}
                             className={`flex items-center gap-4 p-2 ${cardClass} rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.01] group relative`}
                          >
                             <img src={song.coverUrl} className="w-14 h-14 rounded-lg object-cover shadow-sm group-hover:shadow-[0_0_10px_#d946ef]" alt="" />
                             <div className="flex-1 min-w-0">
                               <h3 className={`font-bold text-sm truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{song.title}</h3>
                               <p className={`text-xs ${textSecondary} truncate group-hover:text-[#22d3ee] transition-colors`}>{song.artist}</p>
                             </div>
                             <button 
                                onClick={(e) => handleAddToQueue(song, e)}
                                className={`p-3 rounded-full hover:bg-white/10 ${textSecondary} hover:text-[#d946ef] transition-colors`}
                             >
                                <ListPlus size={20} />
                             </button>
                          </div>
                        ))}
                    </div>
                  )}
               </div>
             )}

             {view === 'liked-songs' && (
                 <div className="p-4 md:p-8">
                     <div className="flex items-center gap-6 mb-8 p-8 bg-gradient-to-r from-[#701a75] to-[#155e75] rounded-[2rem] shadow-2xl text-white relative border border-white/10 overflow-hidden group">
                         <div className="absolute top-[-50%] left-[-20%] w-96 h-96 bg-[#d946ef] rounded-full blur-[120px] opacity-30 group-hover:opacity-40 transition-opacity duration-700"></div>
                         
                         <div className="w-28 h-28 bg-white/10 flex items-center justify-center rounded-3xl backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.3)] border border-white/20 z-10">
                             <Heart size={56} fill="white" className="drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                         </div>
                         <div className="z-10">
                             <h1 className="text-4xl font-bold tracking-tight mb-2">Liked Songs</h1>
                             <p className="text-gray-200 font-medium tracking-wide">{likedSongs.length} neon tracks saved</p>
                         </div>
                         
                         {/* Play All Button triggering Modal */}
                         {likedSongs.length > 0 && (
                            <button 
                              onClick={() => setPlaySelection({ title: 'Liked Songs', songs: likedSongs })}
                              className="absolute bottom-6 right-6 w-16 h-16 bg-[#22d3ee] rounded-full flex items-center justify-center shadow-[0_0_20px_#22d3ee] hover:scale-105 transition hover:bg-[#67e8f9] text-black z-20 border-4 border-white/20"
                            >
                              <Play size={32} fill="black" className="ml-1" />
                            </button>
                         )}
                     </div>
                     
                     <div className="space-y-2">
                        {likedSongs.map((song, i) => (
                             <div 
                                key={song.id} 
                                className={`flex items-center gap-4 p-3 ${cardClass} rounded-xl cursor-pointer group transition`}
                                onClick={() => playFromList(song, likedSongs)}
                             >
                                <span className={`${textSecondary} text-xs w-6 text-center font-mono font-bold group-hover:text-[#d946ef]`}>{i+1}</span>
                                <img src={song.coverUrl} className="w-12 h-12 rounded-lg object-cover shadow-sm" alt="" />
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-bold text-sm truncate group-hover:text-[#d946ef] transition-colors ${headerClass}`}>{song.title}</h3>
                                    <p className={`text-xs ${textSecondary} truncate`}>{song.artist}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); toggleLike(); }} className="text-[#d946ef] p-2 hover:bg-white/10 rounded-full hover:scale-110 transition">
                                    <Trash2 size={18} />
                                </button>
                             </div>
                        ))}
                     </div>
                 </div>
             )}

             {/* PROFILE & LIBRARY VIEW */}
             {view === 'profile' && (
                 <div className="p-4 md:p-8 pb-20">
                    <div className="flex flex-col items-center mb-8 relative">
                        <div className="absolute w-full h-full bg-[#d946ef] blur-[100px] opacity-10 top-0"></div>
                        <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-[#d946ef] to-[#22d3ee] flex items-center justify-center text-6xl font-bold text-white mb-4 shadow-[0_0_30px_#d946ef] border-4 border-[#0f0518] z-10 relative">
                            {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <h1 className={`text-3xl font-bold ${headerClass} z-10`}>{userProfile?.name || 'User Profile'}</h1>
                        <p className={`text-sm ${textSecondary} mb-6 z-10`}>Velvet Premium Member</p>
                        <div className="flex gap-4 z-10">
                            <button 
                                onClick={() => setShowOnboarding(true)}
                                className={`px-8 py-2.5 ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'} rounded-full text-sm font-bold hover:scale-105 transition shadow-[0_0_15px_white]`}
                            >
                                Edit Profile
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 text-center mb-10">
                        <h3 className={`font-bold text-xl mb-6 ${headerClass}`}>Your Stats</h3>
                        <div className="grid grid-cols-3 gap-6">
                            <div className={`${cardClass} p-6 rounded-2xl`}>
                                <div className="text-3xl font-bold text-[#d946ef] mb-1">{likedSongs.length}</div>
                                <div className={`text-xs ${textSecondary} font-bold uppercase tracking-wide`}>Liked Songs</div>
                            </div>
                            <div className={`${cardClass} p-6 rounded-2xl`}>
                                <div className="text-3xl font-bold text-[#22d3ee] mb-1">{userProfile?.artists.length || 0}</div>
                                <div className={`text-xs ${textSecondary} font-bold uppercase tracking-wide`}>Artists</div>
                            </div>
                            <div className={`${cardClass} p-6 rounded-2xl`}>
                                <div className="text-3xl font-bold text-green-400 mb-1">{userProfile?.languages.length || 0}</div>
                                <div className={`text-xs ${textSecondary} font-bold uppercase tracking-wide`}>Languages</div>
                            </div>
                        </div>
                    </div>

                    {/* MY LIBRARY / PLAYLISTS SECTION */}
                    <div className="mb-8">
                        <h3 className={`font-bold text-xl mb-6 ${headerClass} flex items-center gap-2`}>
                            <FolderHeart className="text-[#d946ef]" /> My Playlists
                        </h3>
                        
                        {playlists.length === 0 ? (
                            <div className={`${cardClass} p-8 rounded-2xl text-center`}>
                                <p className={textSecondary}>You haven't created any playlists yet.</p>
                                <p className="text-xs text-gray-500 mt-2">Tap "Add to Playlist" on any song to start.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {playlists.map(playlist => (
                                    <div 
                                        key={playlist.id} 
                                        className={`${cardClass} p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition relative group`}
                                        onClick={(e) => {
                                            // Trigger Play Options Modal
                                            if (playlist.songs.length > 0) {
                                                setPlaySelection({ title: playlist.name, songs: playlist.songs });
                                            } else {
                                                showNotification("This playlist is empty.");
                                            }
                                        }}
                                    >
                                        <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800">
                                            {playlist.coverUrl ? (
                                                <img src={playlist.coverUrl} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><Music2 className="text-gray-600" size={32} /></div>
                                            )}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                <Play fill="white" className="text-white" />
                                            </div>
                                        </div>
                                        <h4 className={`font-bold text-sm truncate ${headerClass}`}>{playlist.name}</h4>
                                        <p className={`text-xs ${textSecondary}`}>{playlist.songs.length} songs</p>
                                        
                                        <button 
                                            onClick={(e) => deletePlaylist(playlist.id, e)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-red-400 opacity-0 group-hover:opacity-100 transition hover:bg-red-500 hover:text-white"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                 </div>
             )}
             
             {view === 'settings' && (
                <div className="p-4 md:p-8 space-y-6">
                    <h2 className={`text-3xl font-bold mb-6 ${headerClass}`}>Settings</h2>
                    
                    <div className={`${cardClass} p-4 rounded-xl flex justify-between items-center`}>
                        <div className="flex items-center gap-3">
                            {theme === 'dark' ? <Moon className="text-[#22d3ee]" /> : <Sun className="text-orange-400" />}
                            <div>
                                <h3 className={`font-bold ${headerClass}`}>App Theme</h3>
                                <p className={`text-xs ${textSecondary}`}>Switch between Light and Velvet Neon</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`px-4 py-2 rounded-full text-xs font-bold ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
                        >
                            {theme === 'dark' ? 'Switch to Light' : 'Switch to Neon'}
                        </button>
                    </div>

                    <div className={`${cardClass} p-4 rounded-xl`}>
                         <div className="mb-4">
                            <h3 className={`font-bold ${headerClass}`}>Default Spatial Audio</h3>
                            <p className={`text-xs ${textSecondary}`}>Set your preferred immersive experience</p>
                         </div>
                         <div className="flex gap-2">
                             {(['off', '8d', '16d', '32d'] as SpatialMode[]).map(mode => (
                                 <button 
                                    key={mode}
                                    onClick={() => setDefaultSpatial(mode)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${defaultSpatial === mode ? 'bg-[#d946ef] text-white border-[#d946ef] shadow-[0_0_15px_#d946ef]' : `border-gray-600 ${textSecondary} hover:border-white hover:text-white`}`}
                                 >
                                     {mode.toUpperCase()}
                                 </button>
                             ))}
                         </div>
                    </div>

                    <div className={`${cardClass} p-4 rounded-xl flex justify-between items-center border-red-500/20`}>
                        <div className="flex items-center gap-3">
                            <RefreshCw className="text-red-500" />
                            <div>
                                <h3 className={`font-bold text-red-500`}>Reset App Data</h3>
                                <p className={`text-xs ${textSecondary}`}>Clear profile & reset to new user state</p>
                            </div>
                        </div>
                        <button 
                            onClick={resetApp}
                            className={`px-4 py-2 rounded-full text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition`}
                        >
                            Reset
                        </button>
                    </div>
                    
                    <button onClick={() => setView('home')} className={`w-full py-3 rounded-xl font-bold ${theme === 'dark' ? 'bg-[#222] text-white hover:bg-[#333]' : 'bg-gray-200 text-black'} transition`}>Back to Home</button>
                </div>
             )}
             
             {view === 'play-together' && (
                 <div className="p-4 md:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-8">
                     <div className="text-center space-y-2">
                        <Users size={64} className="mx-auto text-[#d946ef] mb-4 drop-shadow-[0_0_15px_#d946ef]" />
                        <h2 className={`text-3xl font-bold ${headerClass}`}>Play Together</h2>
                        <p className={textSecondary}>Sync music with up to 5 nearby devices</p>
                     </div>
                     {!connectedDevices.length && !isScanning && (
                         <button onClick={connectDevices} className="bg-gradient-to-r from-[#d946ef] to-[#22d3ee] text-white px-8 py-4 rounded-full font-bold text-lg shadow-[0_0_20px_#d946ef] hover:scale-105 transition animate-pulse">Scan for Nearby Devices</button>
                     )}
                     {isScanning && (
                         <div className="space-y-4 text-center"><div className="w-16 h-16 border-4 border-[#d946ef] border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_10px_#d946ef]"></div><p className={headerClass}>Scanning...</p></div>
                     )}
                     {connectedDevices.length > 0 && (
                         <div className={`w-full max-w-md ${cardClass} rounded-xl p-6`}>
                             <div className="flex justify-between items-center mb-4"><h3 className={`font-bold ${headerClass}`}>Connected Devices ({connectedDevices.length}/5)</h3><div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_green]"></div></div>
                             <div className="space-y-3">{connectedDevices.map((dev, i) => (<div key={i} className="flex items-center gap-3 p-2 rounded bg-black/5 dark:bg-white/5"><PhoneIcon size={18} className="text-[#d946ef]" /><span className={headerClass}>{dev}</span></div>))}</div>
                         </div>
                     )}
                     <button onClick={() => setView('home')} className={`text-sm underline ${textSecondary}`}>Back to Home</button>
                 </div>
             )}

             {view === 'downloads' && (
                 <div className="p-4 md:p-8">
                     <h2 className={`text-3xl font-bold mb-6 ${headerClass}`}>Downloads</h2>
                     <p className={`mb-4 ${textSecondary}`}>Available for offline playback</p>
                     <div className="space-y-2">
                        {likedSongs.length > 0 ? likedSongs.map((song) => (
                             <div key={song.id} onClick={() => playSong(song)} className={`flex items-center gap-4 p-3 ${cardClass} rounded-xl cursor-pointer`}>
                                <div className="bg-[#22d3ee] rounded-full p-2 shadow-[0_0_5px_#22d3ee]"><Download size={14} className="text-black" /></div>
                                <img src={song.coverUrl} className="w-12 h-12 rounded object-cover" alt="" />
                                <div className="flex-1 min-w-0"><h3 className={`font-bold text-sm truncate ${headerClass}`}>{song.title}</h3><p className={`text-xs ${textSecondary} truncate`}>{song.artist}</p></div>
                             </div>
                        )) : (
                            <div className="text-center py-10"><p className={textSecondary}>No downloads yet.</p></div>
                        )}
                     </div>
                 </div>
             )}
      </div>

      <div 
        className={`fixed inset-y-0 left-0 w-3/4 max-w-xs ${drawerClass} border-r z-[60] transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
           <div className="p-6 border-b border-[#d946ef]/20 flex justify-between items-center">
               <h2 className={`text-2xl font-bold bg-gradient-to-r from-[#d946ef] to-[#22d3ee] bg-clip-text text-transparent drop-shadow-md`}>Menu</h2>
               <button onClick={() => setIsMenuOpen(false)}><X className={textSecondary} /></button>
           </div>
           <div className="flex-1 py-4 space-y-1">
               <button onClick={() => {setView('settings'); setIsMenuOpen(false)}} className={`w-full text-left px-6 py-4 hover:bg-white/5 flex items-center gap-4 ${headerClass}`}>
                   <Settings size={20} className={neonCyan} /> Settings
               </button>
               <button onClick={() => {setView('downloads'); setIsMenuOpen(false)}} className={`w-full text-left px-6 py-4 hover:bg-white/5 flex items-center gap-4 ${headerClass}`}>
                   <Download size={20} className={neonCyan} /> Downloads
               </button>
               <button onClick={() => {setView('play-together'); setIsMenuOpen(false)}} className={`w-full text-left px-6 py-4 hover:bg-white/5 flex items-center gap-4 ${headerClass}`}>
                   <Users size={20} className={neonCyan} /> Play Together
               </button>
               <button onClick={setAsRingtone} className={`w-full text-left px-6 py-4 hover:bg-white/5 flex items-center gap-4 ${headerClass}`}>
                   <Bell size={20} className={neonCyan} /> Set as Ringtone
               </button>
               <div className="my-4 border-t border-gray-700 mx-6"></div>
               <button onClick={() => {setTheme(theme === 'dark' ? 'light' : 'dark'); setIsMenuOpen(false)}} className={`w-full text-left px-6 py-4 hover:bg-white/5 flex items-center gap-4 ${headerClass}`}>
                   {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />} Switch Theme
               </button>
               <button onClick={resetApp} className={`w-full text-left px-6 py-4 hover:bg-red-500/10 flex items-center gap-4 text-red-500`}>
                   <LogOut size={20} /> Reset App
               </button>
           </div>
           <div className={`p-6 text-xs ${textSecondary} border-t border-gray-700`}>
               Harmonix v3.5.0
           </div>
      </div>
      {isMenuOpen && <div onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-black/60 z-[50] backdrop-blur-sm"></div>}

      {currentSong && !isPlayerExpanded && (
          <div className={`fixed bottom-[66px] left-0 right-0 z-40 ${theme === 'dark' ? 'bg-transparent' : 'bg-white'} `}>
              <PlayerBar 
                currentSong={currentSong} 
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                isLiked={!!currentSong && !!likedSongs.find(s => s.id === currentSong.id)}
                onToggleLike={toggleLike}
                onExpand={() => setIsPlayerExpanded(true)}
              />
          </div>
      )}

      {currentSong && isPlayerExpanded && (
          <FullScreenPlayer 
             currentSong={currentSong}
             isPlaying={isPlaying}
             onPlayPause={handlePlayPause}
             onNext={handleNext}
             onPrev={handlePrev}
             onClose={() => setIsPlayerExpanded(false)}
             isLiked={!!currentSong && !!likedSongs.find(s => s.id === currentSong.id)}
             onToggleLike={toggleLike}
             onToggleLyrics={() => {}} 
             onToggleQueue={() => setShowQueue(!showQueue)}
             
             shuffleMode={shuffleMode}
             repeatMode={repeatMode}
             onToggleShuffle={toggleShuffle}
             onToggleRepeat={toggleRepeat}
          />
      )}

      <div className={`fixed bottom-0 left-0 w-full h-[64px] ${theme === 'dark' ? 'bg-[#0f0518]/90 border-[#2a0f35]' : 'bg-white/95 border-gray-200'} backdrop-blur-xl border-t z-50 flex items-center justify-around pb-2 shadow-2xl`}>
          <button 
             onClick={() => setView('home')} 
             className={`flex flex-col items-center gap-1 p-2 w-full transition-colors ${view === 'home' ? (theme === 'dark' ? 'text-[#22d3ee] drop-shadow-[0_0_5px_#22d3ee]' : 'text-black') : 'text-gray-500 hover:text-gray-300'}`}
          >
              <HomeIcon size={24} strokeWidth={view === 'home' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">Home</span>
          </button>
          <button 
             onClick={() => setView('search')} 
             className={`flex flex-col items-center gap-1 p-2 w-full transition-colors ${view === 'search' ? (theme === 'dark' ? 'text-[#d946ef] drop-shadow-[0_0_5px_#d946ef]' : 'text-black') : 'text-gray-500 hover:text-gray-300'}`}
          >
              <SearchIcon size={24} strokeWidth={view === 'search' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">Search</span>
          </button>
          <button 
             onClick={() => setView('liked-songs')} 
             className={`flex flex-col items-center gap-1 p-2 w-full transition-colors ${view === 'liked-songs' ? (theme === 'dark' ? 'text-[#22d3ee] drop-shadow-[0_0_5px_#22d3ee]' : 'text-black') : 'text-gray-500 hover:text-gray-300'}`}
          >
              <Heart size={24} fill={view === 'liked-songs' ? (theme === 'dark' ? "#22d3ee" : "black") : "none"} strokeWidth={view === 'liked-songs' ? 0 : 2} />
              <span className="text-[10px] font-medium">Liked</span>
          </button>
          <button 
             onClick={() => setView('profile')} 
             className={`flex flex-col items-center gap-1 p-2 w-full transition-colors ${view === 'profile' ? (theme === 'dark' ? 'text-[#d946ef] drop-shadow-[0_0_5px_#d946ef]' : 'text-black') : 'text-gray-500 hover:text-gray-300'}`}
          >
              <User size={24} fill={view === 'profile' ? (theme === 'dark' ? "#d946ef" : "black") : "none"} strokeWidth={view === 'profile' ? 0 : 2} />
              <span className="text-[10px] font-medium">Profile</span>
          </button>
      </div>

      <PlaylistModal 
        isOpen={!!playlistModalSong} 
        onClose={() => setPlaylistModalSong(null)} 
        playlists={playlists}
        onAddToPlaylist={handleAddToPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
        song={playlistModalSong}
      />

      {selectedArtist && (
          <ArtistModal 
            artistName={selectedArtist} 
            onClose={() => setSelectedArtist(null)} 
            onPlaySong={playSong}
          />
      )}
      
      <QueueDrawer 
          isOpen={showQueue} 
          onClose={() => setShowQueue(false)} 
          queue={queue}
          currentSong={currentSong}
          onPlay={playSong}
      />
    </div>
    </>
  );
}

// Wrap main app content in Error Boundary
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}