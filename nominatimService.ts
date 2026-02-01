
import { ItineraryItem } from '../types';

export class NominatimService {
  static async searchPlace(query: string, locationContext: string): Promise<Partial<ItineraryItem> | null> {
    try {
      // Combine query and location for better results context
      const q = `${query}, ${locationContext}`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9' // Prefer English for consistency
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();

      if (!data || data.length === 0) return null;

      const result = data[0];
      
      // Map OSM category/type to app types
      // Nominatim returns 'class' (broad) and 'type' (specific)
      let appType: 'eating' | 'sightseeing' | 'shopping' | 'transport' | 'hotel' | 'other' = 'other';
      const t = (result.type || '').toLowerCase();
      const c = (result.class || '').toLowerCase();
      
      if (['restaurant', 'cafe', 'bar', 'pub', 'food_court', 'fast_food', 'ice_cream'].includes(t) || c === 'amenity' && t === 'food') {
        appType = 'eating';
      } else if (['museum', 'attraction', 'viewpoint', 'artwork', 'monument', 'historic', 'theme_park', 'zoo', 'aquarium', 'gallery'].includes(t) || c === 'tourism' || c === 'historic') {
        appType = 'sightseeing';
      } else if (['shop', 'mall', 'supermarket', 'convenience', 'department_store', 'clothes', 'fashion'].includes(c) || c === 'shop') {
        appType = 'shopping';
      } else if (['bus_stop', 'station', 'subway', 'aerodrome', 'taxi', 'stop'].includes(t) || c === 'highway' || c === 'railway') {
        appType = 'transport';
      } else if (['hotel', 'motel', 'hostel', 'guest_house', 'apartment'].includes(t)) {
        appType = 'hotel';
      }

      return {
        title: result.name || query, // Fallback to query if name is missing (e.g. strict address)
        address: result.display_name,
        type: appType,
        description: `Found via OpenStreetMap (${c}/${t})`,
        estimatedExpense: 0,
        currency: 'USD',
      };
    } catch (error) {
      console.error("Nominatim Search Error:", error);
      return null;
    }
  }
}
