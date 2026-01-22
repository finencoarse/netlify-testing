
import { GoogleGenAI } from "@google/genai";
import { ItineraryItem, TourGuideData, Trip, Hotel } from "../types";

const STORAGE_KEY_GEMINI_COUNT = 'wanderlust_gemini_count';

export class GeminiService {
  static getUsageCount(): number {
    return parseInt(localStorage.getItem(STORAGE_KEY_GEMINI_COUNT) || '0', 10);
  }

  private static incrementUsage() {
    const count = this.getUsageCount();
    localStorage.setItem(STORAGE_KEY_GEMINI_COUNT, (count + 1).toString());
  }

  private static getClient() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing. Please configure it in your environment or select one via the API Key Selection screen.");
    }
    return new GoogleGenAI({ apiKey });
  }

  private static extractJson(text: string | undefined): any {
    if (!text) return null;
    try {
      // 1. Try direct parse
      return JSON.parse(text);
    } catch (e) {
      // 2. Try extracting from markdown block
      const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonBlockMatch) {
        try { return JSON.parse(jsonBlockMatch[1]); } catch (e2) {}
      }
      // 3. Try finding the first { and last }
      const firstOpen = text.indexOf('{');
      const lastClose = text.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose !== -1) {
        try { return JSON.parse(text.substring(firstOpen, lastClose + 1)); } catch (e3) {}
      }
      console.warn("Failed to extract JSON from response:", text.substring(0, 100) + "...");
      return null;
    }
  }

  /**
   * Translates the text content of a trip to the target language.
   */
  static async translateTrip(trip: Trip, language: string): Promise<Trip | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      
      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const minimalTrip = {
        title: trip.title,
        location: trip.location,
        description: trip.description,
        itinerary: trip.itinerary
      };

      const prompt = `
      Translate the following JSON object's text values to ${targetLanguage}.
      
      Rules:
      1. Preserve the JSON structure EXACTLY.
      2. Only translate values for the keys: "title", "description", "location", "transportMethod", "spendingDescription".
      3. Do NOT translate IDs, times, numbers, or currency codes.
      4. Keep the tone inspiring and travel-focused.
      
      Input JSON:
      ${JSON.stringify(minimalTrip)}
      
      Return ONLY the valid JSON. No markdown.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const translatedData = this.extractJson(response.text);
      if (!translatedData) return null;

      return {
        ...trip,
        title: translatedData.title || trip.title,
        location: translatedData.location || trip.location,
        description: translatedData.description || trip.description,
        itinerary: translatedData.itinerary || trip.itinerary
      };

    } catch (e) {
      console.error("Translation failed:", e);
      return null;
    }
  }

  static async getExchangeRate(fromCurrency: string, toCurrency: string, date?: string): Promise<number | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      const dateQuery = date ? `on ${date}` : "today";
      const prompt = `
      Find the exact exchange rate from ${fromCurrency} to ${toCurrency} ${dateQuery}.
      
      Return ONLY a raw JSON object. Do not include markdown formatting.
      Format: { "rate": 145.5 }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        },
      });

      const result = this.extractJson(response.text);
      return result?.rate || null;
    } catch (e) {
      console.error("Exchange rate fetch failed:", e);
      return null;
    }
  }

  static async editImage(base64Image: string, prompt: string): Promise<string | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      
      const parts = base64Image.split(',');
      if (parts.length < 2) throw new Error("Invalid base64 image string");
      
      const cleanBase64 = parts[1];
      const mimeTypeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType,
                },
              },
              {
                text: prompt,
              },
            ],
          }
        ],
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        throw new Error('Gemini returned an empty response.');
      }

      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error editing image with Gemini:', error);
      throw error;
    }
  }

  static async getMapRoute(location: string, items: ItineraryItem[], language: string = 'en'): Promise<{ text: string; links: { uri: string; title: string }[] }> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      
      let latLng = undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        latLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        // Ignore geolocation errors
      }

      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const itemTitles = items.map(i => i.title).join(', ');
      const prompt = `I am visiting ${location}. Here is my itinerary for today: ${itemTitles}. 
      Please suggest the most efficient travel route between these locations. 
      Explain why this order is best and provide Google Maps links for each place.
      IMPORTANT: Respond in ${targetLanguage}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: latLng
            }
          }
        },
      });

      const text = response.text || "No suggestion found.";
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      const links = groundingChunks
        .filter(chunk => chunk.maps)
        .map(chunk => ({
          uri: chunk.maps!.uri,
          title: chunk.maps!.title || "View on Maps"
        }));

      return { text, links };
    } catch (error) {
      console.error('Error with Maps grounding:', error);
      throw error;
    }
  }

  static async getEventLogistics(location: string, item: ItineraryItem, prevLocation: string | null, language: string = 'en'): Promise<{ price?: number, currency?: string, transportShort?: string, details?: string } | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      const origin = prevLocation ? `from "${prevLocation}"` : 'from the city center';
      
      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const prompt = `
      I am planning a trip to "${location}".
      Event: "${item.title}" (${item.description}).
      
      Task:
      1. Find the current adult entry ticket price (if any). If free, price is 0.
      2. Find the best public transport method to get there ${origin}.
      
      Return a STRICT JSON object.
      {
        "price": number (e.g. 2500, or 0 if free/unknown),
        "currency": "string" (e.g. "¥", "$", "€"),
        "transportShort": "string" (short summary, e.g. "Bus 205"),
        "details": "string" (Detailed instructions)
      }
      
      IMPORTANT: Use Google Search. Translate 'details' and 'transportShort' to ${targetLanguage}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        },
      });

      return this.extractJson(response.text);
    } catch (e) {
      console.error("Logistics research failed:", e);
      return null;
    }
  }

  static async getTourGuideInfo(location: string, item: ItineraryItem, language: string = 'en'): Promise<TourGuideData | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const prompt = `
      You are an expert local tour guide. 
      I am visiting "${item.title}" in "${location}".
      
      Use Google Search to find latest stories and tips.
      
      Return the output STRICTLY as a valid JSON object. 
      The JSON must match this structure:
      {
        "story": "A short, engaging paragraph about the history (max 60 words).",
        "mustEat": ["List of 1-3 general food types famous here"],
        "mustOrder": ["List of 1-3 specific famous menu items"],
        "souvenirs": ["List of 1-3 must-buy souvenir items"],
        "reservationTips": "Any important reservation codes or booking requirements."
      }
      
      IMPORTANT: Translate all the content values into ${targetLanguage}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        },
      });

      return this.extractJson(response.text) as TourGuideData;

    } catch (error) {
      console.error('Error getting tour guide info:', error);
      return null;
    }
  }

  static async getWeatherForecast(location: string, startDate: string, endDate: string): Promise<Record<string, { icon: string, temp: string, condition: string }> | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      const prompt = `
      I need a daily weather forecast estimation for ${location} from ${startDate} to ${endDate}.
      Based on historical weather data for this location and time of year, provide a realistic forecast.
      
      Return a STRICTLY valid JSON object where keys are the dates in YYYY-MM-DD format and values are objects with:
      - "icon": A single emoji representing the weather (e.g. ☀️, 🌧️, ❄️, ⛅).
      - "temp": Temperature range (e.g. "20°C" or "15-22°C").
      - "condition": Short text (e.g. "Sunny", "Rainy").
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      return this.extractJson(response.text);
    } catch (e) {
      console.error("Weather fetch failed:", e);
      return null;
    }
  }

  static async generateTripItinerary(
    location: string, 
    days: number, 
    budget: number, 
    currency: string,
    interests: string,
    language: string
  ): Promise<Partial<Trip> | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const prompt = `
      I need a ${days}-day trip itinerary for ${location}.
      Budget: ${currency}${budget}.
      Interests/Preferences: "${interests}".

      Create a detailed plan.
      Return a STRICTLY valid JSON object.
      
      Structure:
      {
        "title": "A creative title for the trip",
        "description": "A brief overview of the trip experience",
        "itinerary": {
          "1": [
             {
               "time": "09:00",
               "type": "sightseeing",
               "title": "Event Title",
               "description": "Short description of activity",
               "estimatedExpense": 50,
               "currency": "${currency}",
               "transportMethod": "Walking/Taxi/Bus"
             }
          ],
          "2": []
        }
      }

      IMPORTANT: 
      - Translate all text values to ${targetLanguage}.
      - Ensure costs fit within the total budget of ${budget}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      return this.extractJson(response.text);
    } catch (e) {
      console.error("Trip generation failed:", e);
      return null;
    }
  }

  static async discoverPlaces(location: string, query: string, language: string = 'en'): Promise<any[]> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const prompt = `
      Find 5 popular and real places matching "${query}" near "${location}".
      Use Google Search to verify they exist.
      
      Return a STRICT JSON object with a "places" array.
      
      Example structure:
      {
        "places": [
          {
            "title": "Name",
            "description": "Short description (max 10 words)",
            "type": "eating",
            "estimatedExpense": 20
          }
        ]
      }
      
      IMPORTANT: Translate content to ${targetLanguage}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        }
      });

      const result = this.extractJson(response.text);
      return result?.places || [];
    } catch (e) {
      console.error("Discovery failed:", e);
      return [];
    }
  }

  static async recommendHotels(location: string, itinerary: ItineraryItem[], preferences: string, language: string): Promise<Hotel[]> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      const languageNames: Record<string, string> = {
        'en': 'English',
        'zh-TW': 'Traditional Chinese',
        'ja': 'Japanese',
        'ko': 'Korean'
      };
      const targetLanguage = languageNames[language] || 'English';

      const placeList = itinerary.map(item => item.title).slice(0, 15).join(", ");

      const prompt = `
      Act as a travel expert. I need accommodation in "${location}" convenient for visiting: ${placeList}.
      Preferences: "${preferences || 'Good location'}".
      
      Using Google Search, identify 3-4 suitable hotels.
      
      Return a STRICT JSON object.
      {
        "hotels": [
          {
            "name": "Hotel Name",
            "description": "Brief description in ${targetLanguage}",
            "address": "Address",
            "price": "Price estimate string",
            "rating": 4.5,
            "amenities": ["Wifi"],
            "bookingUrl": "url if found",
            "reason": "Why it fits in ${targetLanguage}"
          }
        ]
      }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        }
      });

      const result = this.extractJson(response.text);
      if (!result || !result.hotels) return [];
      
      return (result.hotels || []).map((h: any) => ({ ...h, id: Math.random().toString(36).substr(2, 9) }));
    } catch (e) {
      console.error("Hotel recommendation failed:", e);
      return [];
    }
  }
}
