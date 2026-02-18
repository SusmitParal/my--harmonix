import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Song, ArtistInfo } from "../types";
import { DEMO_TRACK_URL } from "../constants";

// 1. Initialize with Vite-friendly environment variable
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);

export const generateLyrics = async (song: string, artist: string): Promise<string> => {
  if (!API_KEY) return "Lyrics unavailable (API Key missing).";
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Generate synchronized style lyrics for the song "${song}" by "${artist}". Format nicely with stanzas.`;
    
    const result = await model.generateContent(prompt);
    return result.response.text() || "Lyrics not found.";
  } catch (e) {
    console.error("Gemini Error:", e);
    return "Could not load lyrics.";
  }
};

export const smartReorderQueue = async (currentSong: Song, queue: Song[]): Promise<Song[]> => {
    if (!API_KEY || queue.length < 3) return [...queue].sort(() => Math.random() - 0.5);

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const songList = queue.map(s => `${s.title} - ${s.artist}`).join('\n');
        const prompt = `I am listening to "${currentSong.title}" by "${currentSong.artist}". 
            Upcoming songs:
            ${songList}
            Reorder this list for best musical flow. Return ONLY a JSON array of strings (the song titles).`;

        const result = await model.generateContent(prompt);
        const orderedTitles = JSON.parse(result.response.text() || "[]");
        
        const newQueue: Song[] = [];
        orderedTitles.forEach((title: string) => {
            const found = queue.find(s => s.title.toLowerCase().includes(title.toLowerCase()));
            if (found && !newQueue.some(item => item.id === found.id)) {
                newQueue.push(found);
            }
        });
        
        // Add leftovers
        queue.forEach(s => {
            if (!newQueue.some(item => item.id === s.id)) newQueue.push(s);
        });

        return newQueue;
    } catch (e) {
        console.error("AI Shuffle Error:", e);
        return [...queue].sort(() => Math.random() - 0.5);
    }
};

export const generateVibeQuery = async (currentSong: Song, languages: string[]): Promise<string> => {
    if (!API_KEY) return `${currentSong.artist} similar songs`;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const langStr = languages.length > 0 ? languages.join(", ") : "Hindi, English";
        const prompt = `Next song mood after "${currentSong.title}" by "${currentSong.artist}". 
            Language: ${langStr}. Return ONLY a 3-word search query.`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim() || `${currentSong.artist} radio`;
    } catch (e) {
        return `${currentSong.artist} mix`;
    }
};

export const getArtistBio = async (artistName: string): Promise<ArtistInfo> => {
  const fallback = { 
    name: artistName, 
    bio: "Bio unavailable.", 
    imageUrl: `https://picsum.photos/400/400?random=${Math.random()}`,
    topTracks: [] 
  };

  if (!API_KEY) return fallback;

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Provide a short bio for "${artistName}" and 3 top hits. 
      Format as JSON: {"bio": "...", "topHits": [{"title": "...", "album": "..."}]}`;

    const result = await model.generateContent(prompt);
    const data = JSON.parse(result.response.text());

    const topTracks: Song[] = (data.topHits || []).map((hit: any, i: number) => ({
        id: `top_${i}_${Date.now()}`,
        title: hit.title,
        artist: artistName,
        album: hit.album || 'Hits',
        coverUrl: `https://picsum.photos/300/300?random=${i}`,
        duration: 210,
        audioUrl: DEMO_TRACK_URL
    }));

    return {
        name: artistName,
        bio: data.bio || "No bio available.",
        imageUrl: `https://picsum.photos/500/500?random=${artistName}`,
        topTracks
    };
  } catch (e) {
      return fallback;
  }
};
