

import { Song, UserProfile } from '../types';
import { DEMO_TRACK_URL } from '../constants';

// List of available public JioSaavn API instances
const SAAVN_API_ENDPOINTS = [
    'https://saavn.dev/api',
    'https://jiosaavn-api-privatecvc2.vercel.app',
    'https://saavn.me' 
];

const promiseAny = (promises: Promise<any>[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        let errors: any[] = [];
        let rejectedCount = 0;
        if (promises.length === 0) reject(new Error("No promises"));
        promises.forEach(p => {
            p.then(resolve).catch(e => {
                errors.push(e);
                rejectedCount++;
                if (rejectedCount === promises.length) reject(errors);
            });
        });
    });
};

async function fetchFromSaavnFastest(path: string): Promise<any> {
    const requests = SAAVN_API_ENDPOINTS.map(baseUrl => {
        return new Promise(async (resolve, reject) => {
            const controller = new AbortController();
            // Increased timeout slightly to 5s to prevent cutting off slower connections too early
            const timeoutId = setTimeout(() => controller.abort(), 5000); 
            try {
                const res = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error("Status not ok");
                const json = await res.json();
                if (json.success || json.status === 'SUCCESS' || (json.data && json.data.results) || (json.results)) {
                    resolve(json);
                } else {
                    reject(new Error("Invalid data structure"));
                }
            } catch (e) {
                clearTimeout(timeoutId);
                reject(e);
            }
        });
    });
    try {
        return await promiseAny(requests);
    } catch (e) {
        throw new Error("All Saavn API endpoints failed");
    }
}

async function fetchFromSaavn(query: string, limit = 10): Promise<Song[]> {
  try {
    const json = await fetchFromSaavnFastest(`/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
    const results = json.data?.results || json.results || json.data || [];

    if (!Array.isArray(results) || results.length === 0) {
        return fetchFromItunes(query, limit);
    }

    return results.map((track: any) => {
        let imageUrl = track.image?.[2]?.link || track.image?.[1]?.link || track.image?.[0]?.link;
        if (typeof track.image === 'string') imageUrl = track.image; 
        if (!imageUrl) imageUrl = `https://picsum.photos/300/300?random=${Math.random()}`;

        let bestAudio = '';
        if (Array.isArray(track.downloadUrl)) {
             // OPTIMIZATION: Prioritize 320kbps (High Quality) as requested
             const q320 = track.downloadUrl.find((u: any) => u.quality === '320kbps' || u.link?.includes('320') || u.url?.includes('320'));
             const q160 = track.downloadUrl.find((u: any) => u.quality === '160kbps' || u.link?.includes('160') || u.url?.includes('160'));
             const q96 = track.downloadUrl.find((u: any) => u.quality === '96kbps' || u.link?.includes('96') || u.url?.includes('96'));
             
             // High Quality Priority
             const selected = q320 || q160 || q96 || track.downloadUrl[track.downloadUrl.length - 1];
             bestAudio = selected?.link || selected?.url || '';
        } else if (typeof track.downloadUrl === 'string') {
             bestAudio = track.downloadUrl;
        }
        
        if (!bestAudio && track.media_url) bestAudio = track.media_url;

        const title = decodeHtml(track.name || track.title || "Unknown Song");
        const artist = decodeHtml(track.primaryArtists || track.singers || track.artist || "Unknown Artist");
        const album = decodeHtml(track.album?.name || track.album || "Single");

        return {
            id: track.id || `saavn_${Date.now()}_${Math.random()}`,
            title: title,
            artist: artist,
            album: album,
            coverUrl: imageUrl,
            duration: parseInt(track.duration) || 180,
            audioUrl: bestAudio || DEMO_TRACK_URL,
            previewUrl: bestAudio, 
            quality: 'High Definition (320kbps)'
        };
    });
  } catch (e) {
    return fetchFromItunes(query, limit);
  }
}

async function fetchFromItunes(query: string, limit = 10): Promise<Song[]> {
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}&entity=song`);
        const data = await res.json();
        return (data.results || []).map((track: any) => ({
            id: `itunes_${track.trackId}`,
            title: track.trackName,
            artist: track.artistName,
            album: track.collectionName || 'Single',
            coverUrl: track.artworkUrl100?.replace('100x100', '600x600'),
            duration: track.trackTimeMillis ? track.trackTimeMillis / 1000 : 180,
            audioUrl: track.previewUrl,
            previewUrl: track.previewUrl,
            quality: 'Preview (iTunes)'
        }));
    } catch (e) {
        // Ultimate Fallback to avoid empty screens
        return [getFallbackSong(query)];
    }
}

function decodeHtml(html: string) {
    if(!html) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

const getFallbackSong = (title: string): Song => ({
    id: `fallback_${Date.now()}_${Math.random()}`,
    title: title,
    artist: "System",
    album: 'Unknown',
    coverUrl: `https://picsum.photos/300/300?random=${Math.random()}`,
    duration: 180,
    audioUrl: DEMO_TRACK_URL
});

export const getHomeMixes = async (userProfile?: UserProfile) => {
    // Guaranteed fallback Mix to prevent "Empty Home Screen" / Purple Screen issue
    const defaultMix = {
        title: "Harmonix Essentials",
        songs: [
            getFallbackSong("Welcome to Harmonix"),
            getFallbackSong("LoFi Chill"),
            getFallbackSong("Neon Vibes")
        ]
    };

    const categories = [
        { title: "Trending India", query: "Top 50 India", lang: 'Hindi' },
        { title: "Global Top 50", query: "Global Top 50", lang: 'English' },
        { title: "French Pop Hits", query: "Top 50 French Songs", lang: 'French' },
        { title: "Latino Gang", query: "Top 50 Spanish", lang: 'Spanish' },
        { title: "New Hindi Releases", query: "New Hindi Songs", lang: 'Hindi' },
        { title: "Punjabi Swag", query: "Top 50 Punjabi", lang: 'Punjabi' }
    ];

    let finalCategories = [...categories];

    if (userProfile && userProfile.languages.length > 0) {
        const languageMixes = userProfile.languages.map(lang => {
            const cleanLang = lang.split('(')[0].trim();
            return {
                title: `Best of ${cleanLang}`,
                query: `Top ${cleanLang} songs`,
                lang: cleanLang
            };
        });
        
        finalCategories = [...languageMixes, ...finalCategories];
    }

    // Reduce initial load to 4 categories for faster startup
    const mixesToFetch = finalCategories.slice(0, 4); 

    try {
        const results = await Promise.allSettled(mixesToFetch.map(async (cat) => {
            const songs = await fetchFromSaavn(cat.query, 12);
            return {
                title: cat.title,
                songs: songs.length > 0 ? songs : []
            };
        }));

        const successfulMixes = results
            .filter(r => r.status === 'fulfilled')
            // @ts-ignore
            .map(r => r.value)
            .filter(m => m.songs.length > 0);
            
        if (successfulMixes.length === 0) return [defaultMix];
        return successfulMixes;

    } catch (e) {
        return [defaultMix];
    }
};

export const searchTracks = async (query: string): Promise<Song[]> => {
    return fetchFromSaavn(query, 20);
};

const DISCOVERY_QUERIES = [
    "Trending Reels 2024", "Viral Hits India", "Arijit Singh Latest", 
    "Sidhu Moose Wala", "Diljit Dosanjh", "K-Pop Hot 100", "Drake Hits"
];

export const getDiscoverMix = async (userProfile?: UserProfile) => {
    let query = "";
    if (userProfile && Math.random() > 0.3) { 
        if (userProfile.languages.length > 0) {
             const lang = userProfile.languages[Math.floor(Math.random() * userProfile.languages.length)];
             const simpleLang = lang.split('(')[0].trim();
             query = `Trending ${simpleLang} songs`;
        } else if (userProfile.artists.length > 0) {
            const artist = userProfile.artists[Math.floor(Math.random() * userProfile.artists.length)];
            query = `${artist} radio`;
        }
    }
    if (!query) {
        const randomIndex = Math.floor(Math.random() * DISCOVERY_QUERIES.length);
        query = DISCOVERY_QUERIES[randomIndex];
    }
    
    const songs = await fetchFromSaavn(query, 12);
    let title = "✨ " + query;
    return { title: title, songs: songs };
};
