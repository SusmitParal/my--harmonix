import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Song, ArtistInfo } from "../types";
import { DEMO_TRACK_URL } from "../constants";

// 1. Vite/Vercel use import.meta.env instead of process.env
// @ts-ignore
const apiKey = (import.meta as any).env.VITE_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

// Using 1.5 Flash for the "Premium" Harmonix experience
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * GENERATE LYRICS
 */
export const generateLyrics = async (song: string, artist: string): Promise<string> => {
  if (!apiKey) return "Lyrics unavailable (API Key missing).";

  try {
    const prompt = `Generate synchronized style lyrics for the song "${song}" by "${artist}". Format with clear stanzas.`;
    const result = await model.generateContent(prompt);
    return result.response.text() || "Lyrics not found.";
  } catch (e) {
    console.error("Gemini Error:", e);
    return "Could not load lyrics.";
  }
};

/**
 * GENERATE VIBE QUERY (The missing piece that broke your build!)
 */
export const generateVibeQuery = async (currentSong: Song, languages: string[]): Promise<string> => {
    if (!apiKey) return `${currentSong.artist} similar songs`;

    try {
        const langStr = languages.length > 0 ? languages.join(", ") : "Hindi, English";
        const prompt = `I just finished listening to "${currentSong.title}" by "${currentSong.artist}". 
        Suggest a VERY short search query (max 4 words) to find the next song that matches this mood.
        CRITICAL: The song MUST be in one of these languages: ${langStr}.
        Return ONLY the search query string. Do not include quotes.`;
        
        const result = await model.generateContent(prompt);
        return result.response.text()?.trim() || `${currentSong.artist} radio`;
    } catch (e) {
        return `${currentSong.artist} mix`;
    }
};

/**
 * SMART REORDER QUEUE
 */
export const smartReorderQueue = async (currentSong: Song, queue: Song[]): Promise<Song[]> => {
  if (!apiKey || queue.length < 3) return [...queue].sort(() => Math.random() - 0.5);

  try {
    const songList = queue.map(s => `${s.title} - ${s.artist}`).join('\n');

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `Current song: "${currentSong.title}" by "${currentSong.artist}". 
                 Upcoming: ${songList}. Reorder for best musical flow. Return JSON array of titles.`
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING }
        }
      }
    });

    const orderedTitles: string[] = JSON.parse(result.response.text());

    const newQueue = orderedTitles
      .map(title => queue.find(s => s.title.toLowerCase().includes(title.toLowerCase())))
      .filter((s): s is Song => !!s);

    const missing = queue.filter(s => !newQueue.includes(s));
    return [...newQueue, ...missing];
  } catch (e) {
    return [...queue].sort(() => Math.random() - 0.5);
  }
};

/**
 * AI EQUALIZER
 */
export const getAIEqualizerSettings = async (song: string, artist: string): Promise<number[]> => {
  if (!apiKey) return [0, 0, 0, 0, 0, 0];

  try {
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Optimal 6-band EQ (-8 to 8dB) for "${song}" by "${artist}". Bands: 60Hz, 200Hz, 500Hz, 1kHz, 4kHz, 10kHz.` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER }
        }
      }
    });

    const gains = JSON.parse(result.response.text());
    return Array.isArray(gains) ? gains.slice(0, 6) : [0, 0, 0, 0, 0, 0];
  } catch (e) {
    return [0, 0, 0, 0, 0, 0];
  }
};

/**
 * ARTIST BIO & TOP TRACKS
 */
export const getArtistBio = async (artistName: string): Promise<ArtistInfo> => {
  const fallback = { 
    name: artistName, bio: "Bio unavailable.", 
    imageUrl: `https://picsum.photos/400/400?sig=${artistName}`, topTracks: [] 
  };

  if (!apiKey) return fallback;

  try {
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Bio (<100 words) and 3 top hits for "${artistName}".` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            bio: { type: SchemaType.STRING },
            topHits: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  title: { type: SchemaType.STRING },
                  album: { type: SchemaType.STRING }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(result.response.text());

    const topTracks: Song[] = (data.topHits || []).map((hit: any, i: number) => ({
      id: `ai_${artistName}_${i}`,
      title: hit.title,
      artist: artistName,
      album: hit.album || 'Unknown Album',
      coverUrl: `https://picsum.photos/300/300?sig=${i}`,
      duration: 180,
      audioUrl: DEMO_TRACK_URL
    }));

    return {
      name: artistName,
      bio: data.bio,
      imageUrl: `https://picsum.photos/500/500?sig=${artistName}`,
      topTracks
    };
  } catch (e) {
    return fallback;
  }
};
