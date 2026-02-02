
import { Trip, ItineraryItem } from '../types';

export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyAlqsRC5hcYvT-sLUhmUXWPrBdIPhPEmtQ';

const STORAGE_KEY_COUNT = 'wanderlust_maps_count';
const STORAGE_KEY_DATE = 'wanderlust_maps_start';
const LIMIT = 5000;

/**
 * Checks if the API key usage is within the monthly limit (5000 requests).
 * Resets the counter if a month has passed since the start date.
 */
export const canLoadMap = (): boolean => {
  const now = Date.now();
  const startStr = localStorage.getItem(STORAGE_KEY_DATE);
  
  if (!startStr) {
    localStorage.setItem(STORAGE_KEY_DATE, now.toString());
    localStorage.setItem(STORAGE_KEY_COUNT, '0');
    return true;
  }

  const start = parseInt(startStr, 10);
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // Approx 30 days

  if (now - start > oneMonthMs) {
    // Reset quota for new month
    localStorage.setItem(STORAGE_KEY_DATE, now.toString());
    localStorage.setItem(STORAGE_KEY_COUNT, '0');
    return true;
  }

  const count = parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10);
  return count < LIMIT;
};

/**
 * Increments the map usage counter. Should be called when the map iframe is rendered.
 */
export const recordMapLoad = () => {
   const count = parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10);
   localStorage.setItem(STORAGE_KEY_COUNT, (count + 1).toString());
};

export const getMapUsage = (): number => {
  return parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '0', 10);
};

/**
 * Extracts a location query from a Google Maps URL.
 */
const extractLocationFromUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('google.com') && urlObj.pathname.includes('/maps')) {
      // Handle /maps/place/LocationName
      // Example: https://www.google.com/maps/place/Eiffel+Tower/...
      if (urlObj.pathname.includes('/place/')) {
        const parts = urlObj.pathname.split('/place/');
        if (parts[1]) {
          // Take the part before the next slash (if any) or query params
          let query = parts[1].split('/')[0];
          // Replace + with space and decode
          return decodeURIComponent(query.replace(/\+/g, ' '));
        }
      }
      
      // Handle query param ?q=Location or ?query=Location
      // Example: https://www.google.com/maps?q=35.6895,139.6917
      const q = urlObj.searchParams.get('q');
      if (q) return q;
      
      const query = urlObj.searchParams.get('query');
      if (query) return query;
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return null;
};

/**
 * Generates the Google Maps Embed URL based on the trip location and itinerary events.
 * Prioritizes explicitly provided address, then extracted URL location, then title.
 */
export const getMapUrl = (tripLocation: string, events: ItineraryItem[]): string => {
  const baseUrl = 'https://www.google.com/maps/embed/v1';
  
  // Resolve locations for each event
  const locations: string[] = events.map(e => {
    // 1. Coordinates (Highest Priority - Exact Location)
    if (e.lat !== undefined && e.lng !== undefined) {
      return `${e.lat},${e.lng}`;
    }

    // 2. Explicit Address
    if (e.address && e.address.trim() !== '') return e.address;

    // 3. Try to get precise location from URL
    const urlLocation = extractLocationFromUrl(e.url);
    if (urlLocation) return urlLocation;
    
    // 4. Fallback to Title + Trip Location context
    if (e.title && e.title.trim() !== '') {
        // Simple heuristic: if title looks like a place, use it.
        return `${e.title}, ${tripLocation}`;
    }
    return null;
  }).filter((loc): loc is string => loc !== null);

  // Deduplicate consecutive locations to prevent 0-distance legs in directions
  const uniqueLocations = locations.filter((loc, i, arr) => i === 0 || loc !== arr[i - 1]);

  if (uniqueLocations.length === 0) {
    // Show the general trip location if no specific events
    return `${baseUrl}/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(tripLocation)}`;
  }

  if (uniqueLocations.length === 1) {
    // Show single place
    return `${baseUrl}/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(uniqueLocations[0])}`;
  }

  // Show directions for multiple events
  // Embed API supports up to 20 waypoints (plus origin and destination)
  const origin = uniqueLocations[0];
  const destination = uniqueLocations[uniqueLocations.length - 1];
  
  let url = `${baseUrl}/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  
  if (uniqueLocations.length > 2) {
    // Take intermediate points
    // Slice (1, -1) takes everything except first and last
    // Slice (0, 20) ensures we don't exceed API limits
    const waypoints = uniqueLocations.slice(1, -1).slice(0, 20)
      .map(loc => encodeURIComponent(loc))
      .join('|');
    url += `&waypoints=${waypoints}`;
  }

  return url;
};

/**
 * Generates a Universal Cross-Platform URL to open the route in the native Google Maps App or Website.
 */
export const getExternalMapsUrl = (location: string, items: ItineraryItem[]): string => {
  const locations: string[] = items.map(e => {
    if (e.lat !== undefined && e.lng !== undefined) return `${e.lat},${e.lng}`;
    if (e.address && e.address.trim() !== '') return e.address;
    const urlLocation = extractLocationFromUrl(e.url);
    if (urlLocation) return urlLocation;
    if (e.title && e.title.trim() !== '') return `${e.title}, ${location}`;
    return null;
  }).filter((loc): loc is string => loc !== null);

  if (locations.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  if (locations.length === 1) {
     return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locations[0])}`;
  }

  const origin = encodeURIComponent(locations[0]);
  const destination = encodeURIComponent(locations[locations.length - 1]);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;

  if (locations.length > 2) {
    const waypoints = locations.slice(1, -1).map(loc => encodeURIComponent(loc)).join('|');
    url += `&waypoints=${waypoints}`;
  }

  return url;
};
