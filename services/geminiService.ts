
import { GoogleGenAI } from "@google/genai";
import { ItineraryItem, TourGuideData, Trip } from "../types";

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

  /**
   * Fetches the exchange rate between two currencies for a specific date using Google Search.
   */
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
        },
      });

      const text = response.text;
      if (!text) return null;

      let cleanJson = text.trim();
      // Cleanup markdown if model adds it despite instructions
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '');
      }
      
      const result = JSON.parse(cleanJson);
      return result.rate || null;
    } catch (e) {
      console.error("Exchange rate fetch failed:", e);
      return null;
    }
  }

  /**
   * Edits an image based on a text prompt using gemini-2.5-flash-image.
   * Fixed 'INVALID_ARGUMENT' error by improving base64 cleaning and content structure.
   */
  static async editImage(base64Image: string, prompt: string): Promise<string | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      
      // Extract base64 data and mimeType robustly
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

      // Look for the image part in the response
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      
      // If no image was returned but text was, it might be a refusal or description
      const textPart = candidate.content.parts.find(p => p.text);
      if (textPart) {
        console.warn("Gemini response contained text but no image:", textPart.text);
      }
      
      return null;
    } catch (error) {
      console.error('Error editing image with Gemini:', error);
      throw error;
    }
  }

  /**
   * Uses Google Maps grounding to suggest an efficient route for a list of locations.
   */
  static async getMapRoute(location: string, items: ItineraryItem[], language: string = 'en'): Promise<{ text: string; links: { uri: string; title: string }[] }> {
    this.incrementUsage();
    try {
      const ai = this.getClient();
      
      // Get user location for context
      let latLng = undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        latLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        console.warn("Geolocation not available for Maps grounding context.");
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

  /**
   * Acts as a Tour Guide to find stories and tips for a specific itinerary item.
   */
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
      My notes say: "${item.description}".
      
      Please use Google Search to find the latest interesting stories and practical guide information.
      
      Return the output STRICTLY as a valid JSON object. 
      Do not use markdown formatting (like \`\`\`json). Just return the raw JSON string.
      
      The JSON must match this structure:
      {
        "story": "A short, engaging paragraph about the history or a fun fact about this place (max 60 words).",
        "mustEat": ["List of 1-3 general food types famous here (e.g. 'Matcha Ice Cream', 'Crab')"],
        "mustOrder": ["List of 1-3 specific famous menu items or signature dishes to order"],
        "souvenirs": ["List of 1-3 must-buy souvenir items"],
        "reservationTips": "Any important reservation codes, best times to visit, or booking requirements."
      }
      
      IMPORTANT: Translate all the content values into ${targetLanguage}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text;
      if (!text) return null;
      
      let cleanJson = text.trim();
      const jsonBlockMatch = cleanJson.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonBlockMatch) {
        cleanJson = jsonBlockMatch[1];
      } else {
        const firstOpen = cleanJson.indexOf('{');
        const lastClose = cleanJson.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
          cleanJson = cleanJson.substring(firstOpen, lastClose + 1);
        }
      }

      return JSON.parse(cleanJson) as TourGuideData;

    } catch (error) {
      console.error('Error getting tour guide info:', error);
      return null;
    }
  }

  /**
   * Gets daily weather forecast for a trip.
   */
  static async getWeatherForecast(location: string, startDate: string, endDate: string): Promise<Record<string, { icon: string, temp: string, condition: string }> | null> {
    this.incrementUsage();
    try {
      const ai = this.getClient();

      // Removed googleSearch tool to prevent refusals ("I am sorry I cannot predict...").
      // We use standard generation with JSON enforcement to get historical/typical weather data.
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

      const text = response.text;
      if (!text) return null;

      // With responseMimeType: 'application/json', the text should be clean JSON.
      // We still include a basic cleanup just in case.
      let cleanJson = text.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
      }

      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Weather fetch failed:", e);
      return null;
    }
  }

  /**
   * Generates a full trip itinerary based on basic inputs.
   */
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
      Return a STRICTLY valid JSON object. Do not include markdown formatting.
      
      Structure:
      {
        "title": "A creative title for the trip",
        "description": "A brief overview of the trip experience",
        "itinerary": {
          "1": [  // Day 1 events
             {
               "time": "09:00",
               "type": "sightseeing", // Options: sightseeing, eating, shopping, transport, other
               "title": "Event Title",
               "description": "Short description of activity",
               "estimatedExpense": 50, // Number only
               "currency": "${currency}",
               "transportMethod": "Walking/Taxi/Bus"
             },
             ... more events for Day 1
          ],
          "2": [ ... Day 2 events ... ]
          // Continue for all ${days} days
        }
      }

      IMPORTANT: 
      - Translate all text values to ${targetLanguage}.
      - Ensure costs fit within the total budget of ${budget}.
      - 'itinerary' keys must be string numbers "1", "2", etc. representing the day number.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const text = response.text;
      if (!text) return null;

      let cleanJson = text.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
      }
      
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Trip generation failed:", e);
      return null;
    }
  }

  /**
   * Discovers nearby places based on a query category.
   */
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
      Do NOT use Markdown.
      
      Example structure:
      {
        "places": [
          {
            "title": "Name",
            "description": "Short description (max 10 words)",
            "type": "eating", // or sightseeing, shopping, other
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
        }
      });

      const text = response.text;
      if (!text) return [];

      let cleanJson = text.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '');
      }
      
      const result = JSON.parse(cleanJson);
      return result.places || [];
    } catch (e) {
      console.error("Discovery failed:", e);
      return [];
    }
  }
}
