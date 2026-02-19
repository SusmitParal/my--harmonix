import { Client } from "@google/genai";
import { Song, ArtistInfo } from "../types";
import { DEMO_TRACK_URL } from "../constants";

// In Vite, use import.meta.env. Your key in Vercel must be VITE_GEMINI_API_KEY
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Initialize the Gemini 3 Client
const client = new Client({ apiKey: API_KEY });

export const generateLyrics = async (song: string, artist: string): Promise<string> => {
  if (!API_KEY) return "Lyrics unavailable (API Key missing).";
  
  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate synchronized style lyrics for the song "${song}" by "${artist}". Format nicely with stanzas.`,
    });
    return response.text || "Lyrics not found.";
  } catch (e) {
    console.error("Gemini Error:", e);
    return "Could not load lyrics.";
  }
};

export const smartReorderQueue = async (currentSong: Song, queue: Song[]): Promise<Song[]> => {
    if (!API_KEY || queue.length < 3) return [...queue].sort(() => Math.random() - 0.5);

    try {
        const songList = queue.map(s => `${s.title} - ${s.artist}`).join('\n');
        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `I am listening to "${currentSong.title}" by "${currentSong.artist}". 
            Upcoming songs: ${songList}
            Reorder this list for the best musical flow. Return ONLY a JSON array of strings.`,
            config: {
                responseMimeType: "application/json"
            }
        });

        const orderedTitles = JSON.parse(response.text || "[]");
        const newQueue: Song[] = [];
        
        orderedTitles.forEach((title: string) => {
            const found = queue.find(s => title.toLowerCase().includes(s.title.toLowerCase()));
            if (found && !newQueue.includes(found)) newQueue.push(found);
        });
        
        queue.forEach(s => { if (!newQueue.includes(s)) newQueue.push(s); });
        return newQueue;
    } catch (e) {
        return [...queue].sort(() => Math.random() - 0.5);
    }
};

export const generateVibeQuery = async (currentSong: Song, languages: string[]): Promise<string> => {
    if (!API_KEY) return `${currentSong.artist} similar songs`;
    try {
        const langStr = languages.length > 0 ? languages.join(", ") : "Hindi, English";
        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Mood search query (max 4 words) for a song like "${currentSong.title}" in ${langStr}.`,
        });
        return response.text?.trim() || `${currentSong.artist} radio`;
    } catch (e) {
        return `${currentSong.artist} mix`;
    }
};

export const getArtistBio = async (artistName: string): Promise<ArtistInfo> => {
  if (!API_KEY) {
      return { 
          name: artistName, 
          bio: "Bio unavailable.", 
          imageUrl: `https://picsum.photos/400/400?random=${Math.random()}`,
          topTracks: [] 
      };
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Short bio and 3 top hits for "${artistName}". Return JSON with "bio" (string) and "topHits" (array of {title, album}).`,
      config: { responseMimeType: "application/json" }
    });

    const data = JSON.parse(response.text || "{}");
    const topTracks: Song[] = (data.topHits || []).map((hit: any, i: number) => ({
        id: `artist_top_${i}_${Date.now()}`,
        title: hit.title,
        artist: artistName,
        album: hit.album || 'Greatest Hits',
        coverUrl: `https://picsum.photos/300/300?random=${Math.random()}`,
        duration: 200,
        audioUrl: DEMO_TRACK_URL
    }));

    return {
        name: artistName,
        bio: data.bio || "No bio available.",
        imageUrl: `https://picsum.photos/500/500?random=${Math.random()}`,
        topTracks
    };
  } catch (e) {
      return { name: artistName, bio: "Fetch error.", imageUrl: "", topTracks: [] };
  }
}

export const getAIEqualizerSettings = async (song: string, artist: string): Promise<number[]> => {
    if (!API_KEY) return [0,0,0,0,0,0];
    try {
        const response = await client.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: `6-band EQ (-8 to 8 dB) for "${song}" by "${artist}". Frequencies: 60Hz, 200Hz, 500Hz, 1kHz, 4kHz, 10kHz. Return ONLY a JSON array of 6 numbers.`,
             config: { responseMimeType: "application/json" }
        });
        const gains = JSON.parse(response.text || "[0,0,0,0,0,0]");
        return Array.isArray(gains) ? gains : [0,0,0,0,0,0];
    } catch (e) {
        return [0,0,0,0,0,0];
    }
}

export const generateRecommendations = async (context: string): Promise<Song[]> => [];
export const searchMusic = async (query: string): Promise<Song[]> => [];
