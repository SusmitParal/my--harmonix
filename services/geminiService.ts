import { GoogleGenerativeAI } from "@google/generative-ai";
import { Song, ArtistInfo } from "../types";
import { DEMO_TRACK_URL } from "../constants";

// In Vite/Vercel, ensure you use VITE_ prefix for client-side access
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Initialize the official Google Generative AI instance
const genAI = new GoogleGenerativeAI(API_KEY);

export const generateLyrics = async (song: string, artist: string): Promise<string> => {
  if (!API_KEY) return "Lyrics unavailable (API Key missing).";

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Generate synchronized style lyrics for the song "${song}" by "${artist}". Format nicely with stanzas.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || "Lyrics not found.";
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
            Upcoming songs: ${songList}
            Reorder this list for the best musical flow based on mood and energy. 
            Return ONLY a JSON array of strings containing the song titles.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const orderedTitles = JSON.parse(response.text() || "[]");
        
        const newQueue: Song[] = [];

        // Match titles back to original song objects
        orderedTitles.forEach((title: string) => {
            const found = queue.find(s => title.toLowerCase().includes(s.title.toLowerCase()));
            if (found && !newQueue.includes(found)) newQueue.push(found);
        });

        // Add any songs that the AI might have missed
        queue.forEach(s => { if (!newQueue.includes(s)) newQueue.push(s); });
        return newQueue;
    } catch (e) {
        console.error("Reorder Error:", e);
        return [...queue].sort(() => Math.random() - 0.5);
    }
};

export const generateVibeQuery = async (currentSong: Song, languages: string[]): Promise<string> => {
    if (!API_KEY) return `${currentSong.artist} similar songs`;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const langStr = languages.length > 0 ? languages.join(", ") : "Hindi, English";
        const prompt = `Provide a 3-word search query for a music app to find songs with a similar vibe to "${currentSong.title}" by "${currentSong.artist}" in ${langStr}. Return only the query.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text()?.trim() || `${currentSong.artist} radio`;
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
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Short bio and 3 top hits for the artist "${artistName}". Return a JSON object with keys "bio" (string) and "topHits" (array of objects with "title" and "album").`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const data = JSON.parse(response.text() || "{}");

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
      console.error("Bio Error:", e);
      return { name: artistName, bio: "Information currently unavailable.", imageUrl: "", topTracks: [] };
  }
}

export const getAIEqualizerSettings = async (song: string, artist: string): Promise<number[]> => {
    if (!API_KEY) return [0,0,0,0,0,0];
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Suggest a 6-band EQ setting (values between -8 and 8) for the song "${song}" by "${artist}". 
            Frequencies: 60Hz, 200Hz, 500Hz, 1kHz, 4kHz, 10kHz. Return ONLY a JSON array of 6 numbers.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const gains = JSON.parse(response.text() || "[0,0,0,0,0,0]");
        return Array.isArray(gains) ? gains : [0,0,0,0,0,0];
    } catch (e) {
        return [0,0,0,0,0,0];
    }
}

export const generateRecommendations = async (context: string): Promise<Song[]> => [];
export const searchMusic = async (query: string): Promise<Song[]> => [];
