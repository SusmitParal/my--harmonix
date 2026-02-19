import { GoogleGenerativeAI } from "@google/generative-ai";
import { Song, ArtistInfo } from "../types";
import { DEMO_TRACK_URL } from "../constants";

// Use Vite's way of calling environment variables
const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY || '';

// Initialize the official client
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
            Here is a list of upcoming songs:
            ${songList}
            
            Reorder this list to create the best musical flow/vibe continuing from the current song. 
            Return the song titles in the new order as a JSON array of strings.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const orderedTitles = JSON.parse(response.text() || "[]");
        
        const newQueue: Song[] = [];
        orderedTitles.forEach((title: string) => {
            const found = queue.find(s => title.includes(s.title) || s.title.includes(title));
            if (found && !newQueue.includes(found)) {
                newQueue.push(found);
            }
        });
        
        queue.forEach(s => {
            if (!newQueue.includes(s)) newQueue.push(s);
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
        const prompt = `I just finished listening to "${currentSong.title}" by "${currentSong.artist}". 
            Suggest a VERY short search query (max 4 words) to find the next song that matches this mood/vibe (e.g. late night drive, party, sad, upbeat).
            CRITICAL: The song MUST be in one of these languages: ${langStr}.
            Return ONLY the search query string. Do not include quotes.`;

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
          bio: "Bio unavailable in demo mode.", 
          imageUrl: `https://picsum.photos/400/400?random=${Math.random()}`,
          topTracks: [] 
      };
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Provide a short biography (under 100 words) for music artist "${artistName}" and a list of their 3 top hits. Return JSON format with "bio" string and "topHits" array of objects with "title" and "album".`;

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
      return { 
          name: artistName, 
          bio: "Could not fetch bio.", 
          imageUrl: `https://picsum.photos/400/400?random=${Math.random()}`,
          topTracks: []
      };
  }
}

export const generateRecommendations = async (context: string): Promise<Song[]> => [];
export const searchMusic = async (query: string): Promise<Song[]> => [];
