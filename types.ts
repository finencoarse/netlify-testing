
export interface Photo {
  id: string;
  url: string;
  caption: string;
  date: string;
  tags: string[];
  isFavorite?: boolean;
  type?: 'image' | 'video';
  duration?: number;
  comments?: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  date: string;
  author: string;
}

export interface FlightInfo {
  code: string;
  gate: string;
  airport: string;
  transport: string;
  label?: string;
}

export interface TourGuideData {
  story: string;
  mustEat: string[];
  mustOrder: string[];
  souvenirs: string[];
  reservationTips: string;
}

export interface ItineraryItem {
  id: string;
  time?: string; // HH:mm (Start Time)
  endTime?: string; // HH:mm (End Time)
  period?: 'morning' | 'afternoon' | 'night';
  type: 'sightseeing' | 'shopping' | 'eating' | 'transport' | 'other';
  title: string;
  description: string;
  url?: string;
  estimatedExpense: number;
  actualExpense: number;
  currency?: string;
  spendingDescription?: string;
  transportMethod?: string;
  travelDuration?: string;
  guideInfo?: TourGuideData;
}

export interface UserProfile {
  name: string;
  pfp: string;
  nationality: string;
  isOnboarded: boolean;
}

export interface CustomEvent {
  id: string;
  date: string;
  name: string;
  color?: string;
  type?: 'holiday' | 'custom';
  hasReminder?: boolean;
}

export interface Memo {
  id: string;
  text: string;
  color: string;
  date: string;
}

export interface Trip {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
  status: 'past' | 'future';
  coverImage: string;
  photos: Photo[];
  comments: Comment[];
  rating: number;
  dayRatings: Record<string, number>;
  favoriteDays: string[];
  itinerary: Record<string, ItineraryItem[]>;
  isPinned?: boolean;
  budget?: number;
  flights?: Record<string, FlightInfo[]>;
  departureFlight?: FlightInfo;
  returnFlight?: FlightInfo;
  defaultCurrency?: string;
}

export type ViewState = 'onboarding' | 'dashboard' | 'trip-detail' | 'planner' | 'calendar' | 'budget' | 'editor' | 'settings';

export type Language = 'en' | 'zh-TW' | 'ja' | 'ko';

export type FontSize = 'small' | 'medium' | 'large';

export interface TripVersion {
  id: string;
  tripId: string;
  timestamp: string;
  note: string;
  data: Trip;
}
