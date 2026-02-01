
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
  price?: number;      // Estimated cost
  actualPrice?: number; // Actual cost
  departureTime?: string;
  arrivalTime?: string;
}

export interface Hotel {
  id: string;
  name: string;
  description: string;
  address: string;
  price: string;
  rating: number;
  amenities: string[];
  bookingUrl?: string;
  reason?: string; // Why AI recommended it
  // Enhanced fields
  checkIn?: string;
  checkOut?: string;
  roomType?: string;
  servicesIncluded?: string;
  notes?: string;
  website?: string;
}

export interface TourGuideData {
  story: string;
  mustEat: string[];
  mustOrder: string[];
  souvenirs: string[];
  reservationTips: string;
}

export interface ExpensePart {
  id: string;
  label: string;
  amount: number;
  isUncounted?: boolean;
}

export interface StandaloneExpense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: 'eating' | 'shopping' | 'sightseeing' | 'transport' | 'other';
  date?: string;
  notes?: string;
}

export interface PlanningResource {
  id: string;
  title: string;
  url: string;
  image?: string; // Base64 screenshot or image URL
  note?: string;
}

export interface ItineraryItem {
  id: string;
  time?: string; // HH:mm (Start Time)
  endTime?: string; // HH:mm (End Time)
  period?: 'morning' | 'afternoon' | 'night';
  type: 'sightseeing' | 'shopping' | 'eating' | 'transport' | 'other' | 'hotel';
  title: string;
  description: string;
  address?: string; // Specific address for map
  url?: string;
  screenshot?: string; // New field for event-specific screenshot
  estimatedExpense: number;
  actualExpense: number;
  currency?: string;
  spendingDescription?: string;
  transportMethod?: string;
  travelDuration?: string;
  guideInfo?: TourGuideData;
  expenseParts?: ExpensePart[];
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
  hotels?: Hotel[];
  expenses?: StandaloneExpense[];
  resources?: PlanningResource[];
}

export type ViewState = 'onboarding' | 'dashboard' | 'trip-detail' | 'planner' | 'calendar' | 'budget' | 'editor' | 'settings';

export type Language = 'en' | 'zh-TW' | 'ja' | 'ko';

export type FontSize = 'small' | 'medium' | 'large';

export type DeviceViewMode = 'full' | 'mobile' | 'tablet';

export interface TripVersion {
  id: string;
  tripId: string;
  timestamp: string;
  note: string;
  data: Trip;
}
