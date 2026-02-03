
import React, { useState, useEffect, useMemo } from 'react';
import { Trip, ItineraryItem, Photo, Language, UserProfile, FlightInfo, Hotel } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';
import { NominatimService } from '../services/nominatimService';
import { GroqService } from '../services/groqService';
import { getExternalMapsUrl, getMapUrl, extractLocationFromUrl } from '../services/mapsService';

interface TripDetailProps {
  trip: Trip;
  onUpdate: (trip: Trip) => void;
  onEditPhoto: (photo: Photo) => void;
  onBack: () => void;
  language: Language;
  darkMode: boolean;
  userProfile: UserProfile;
}

const TripDetail: React.FC<TripDetailProps> = ({ trip, onUpdate, onEditPhoto, onBack, language, darkMode }) => {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'itinerary' | 'photos' | 'info' | 'accommodation'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<string>(Object.keys(trip.itinerary).sort()[0] || trip.startDate);
  const [itineraryView, setItineraryView] = useState<'day' | 'overview'>('day');
  
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventDate, setEditingEventDate] = useState<string | null>(null);
  
  // Drag and Drop State
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  
  // Image Preview State (Lightbox)
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Title & Cover Editing State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(trip.title);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);

  // Date Editing State
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [dateForm, setDateForm] = useState({ start: trip.startDate, end: trip.endDate });

  // Sync dateForm when trip updates externally
  useEffect(() => {
    setDateForm({ start: trip.startDate, end: trip.endDate });
  }, [trip.startDate, trip.endDate]);

  // Flight Edit State
  const [showFlightModal, setShowFlightModal] = useState(false);
  const [editingFlightType, setEditingFlightType] = useState<'departure' | 'return' | 'complex' | null>(null);
  const [editingComplexDate, setEditingComplexDate] = useState<string>('');
  const [editingComplexIndex, setEditingComplexIndex] = useState<number>(-1);
  const [flightForm, setFlightForm] = useState<FlightInfo>({ code: '', airport: '', gate: '', transport: '', departureTime: '', arrivalTime: '' });

  // Map & AI State
  const [showMap, setShowMap] = useState(true);
  const [weather, setWeather] = useState<Record<string, { icon: string, temp: string, condition: string }> | null>(null);

  // Map Search State
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResult, setMapSearchResult] = useState<Partial<ItineraryItem> | null>(null);
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationStatus, setOptimizationStatus] = useState('');
  const [routeSummary, setRouteSummary] = useState<string | null>(null);

  // Discover Nearby State
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);

  // Hotel Recommendation & Management State
  const [hotelPreferences, setHotelPreferences] = useState('');
  const [isSearchingHotels, setIsSearchingHotels] = useState(false);
  const [showHotelModal, setShowHotelModal] = useState(false);
  const [hotelForm, setHotelForm] = useState<Partial<Hotel>>({});
  const [hotelUrlInput, setHotelUrlInput] = useState('');
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);

  // Event Form State - Now includes 'date', 'address', 'lat', 'lng'
  const [eventForm, setEventForm] = useState<Partial<ItineraryItem> & { date: string, address: string }>({
    title: '',
    address: '',
    description: '',
    time: '',
    date: selectedDate, // Default to selected date
    period: 'morning',
    type: 'sightseeing',
    estimatedExpense: 0,
    transportMethod: '',
    url: '',
    screenshot: '',
    lat: undefined,
    lng: undefined
  });

  // Ensure selectedDate is valid
  useEffect(() => {
    const hasKeys = Object.keys(trip.itinerary).length > 0;
    if (hasKeys && (!selectedDate || !trip.itinerary[selectedDate])) {
       setSelectedDate(Object.keys(trip.itinerary).sort()[0]);
    } else if (!hasKeys) {
       if (!selectedDate || selectedDate < trip.startDate || selectedDate > trip.endDate) {
         setSelectedDate(trip.startDate);
       }
    }
  }, [trip.itinerary, trip.startDate, trip.endDate, selectedDate]);

  // Clear route summary when changing dates
  useEffect(() => {
    setRouteSummary(null);
  }, [selectedDate]);

  // Fetch Weather
  useEffect(() => {
    let isMounted = true;
    if (trip.location && trip.startDate && trip.endDate) {
      GeminiService.getWeatherForecast(trip.location, trip.startDate, trip.endDate)
        .then(res => {
          if (isMounted && res) setWeather(res);
        })
        .catch(console.error);
    }
    return () => { isMounted = false; };
  }, [trip.location, trip.startDate, trip.endDate]);

  const handleSaveTitle = () => {
    onUpdate({ ...trip, title: titleInput });
    setIsEditingTitle(false);
  };

  const handleSaveDates = () => {
    if (!dateForm.start || !dateForm.end) return;
    
    const getUTCDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    };
    const oldStart = getUTCDate(trip.startDate);
    const newStart = getUTCDate(dateForm.start);
    const diffTime = newStart.getTime() - oldStart.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const shiftDate = (dateStr: string, days: number): string => {
        const d = getUTCDate(dateStr);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().split('T')[0];
    };

    if (diffDays !== 0) {
        const newItinerary: Record<string, ItineraryItem[]> = {};
        Object.entries(trip.itinerary).forEach(([d, items]) => {
            newItinerary[shiftDate(d, diffDays)] = items as ItineraryItem[];
        });
        const newFlights: Record<string, FlightInfo[]> = {};
        if (trip.flights) {
            Object.entries(trip.flights).forEach(([d, items]) => {
                newFlights[shiftDate(d, diffDays)] = items as FlightInfo[];
            });
        }
        const newDayRatings: Record<string, number> = {};
        if (trip.dayRatings) {
            Object.entries(trip.dayRatings).forEach(([d, r]) => {
                newDayRatings[shiftDate(d, diffDays)] = r as number;
            });
        }
        const newExpenses = (trip.expenses || []).map(exp => ({
            ...exp,
            date: exp.date ? shiftDate(exp.date, diffDays) : exp.date
        }));
        
        setSelectedDate(dateForm.start);
        onUpdate({
            ...trip,
            startDate: dateForm.start,
            endDate: dateForm.end,
            itinerary: newItinerary,
            flights: newFlights,
            dayRatings: newDayRatings,
            expenses: newExpenses
        });
    } else {
        onUpdate({
            ...trip,
            startDate: dateForm.start,
            endDate: dateForm.end
        });
    }
    setIsEditingDates(false);
  };

  const handleGenerateCover = async () => {
    setIsGeneratingCover(true);
    try {
      const prompt = `Cinematic travel photography of ${trip.location}, theme: ${trip.title}. High resolution, vibrant, majestic scenery, 4k.`;
      const base64 = await GeminiService.generateImage(prompt);
      if (base64) {
        onUpdate({ ...trip, coverImage: base64 });
      }
    } catch (e) {
      alert("Failed to generate image. Please check your API key and connection.");
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleSaveEvent = () => {
    if (!eventForm.date || !eventForm.title) return;
    
    let finalPeriod = eventForm.period;
    if (!finalPeriod) {
        if (eventForm.time) {
            const hour = parseInt(eventForm.time.split(':')[0], 10);
            if (hour >= 12 && hour < 18) finalPeriod = 'afternoon';
            else if (hour >= 18) finalPeriod = 'night';
            else finalPeriod = 'morning';
        } else {
            finalPeriod = 'morning';
        }
    }

    const newItem: ItineraryItem = {
      id: editingEventId || Date.now().toString(),
      title: eventForm.title || 'New Event',
      address: eventForm.address || '',
      lat: eventForm.lat,
      lng: eventForm.lng,
      description: eventForm.description || '',
      time: eventForm.time || '', 
      period: finalPeriod as 'morning' | 'afternoon' | 'night',
      type: eventForm.type || 'sightseeing',
      estimatedExpense: eventForm.estimatedExpense || 0,
      actualExpense: 0,
      currency: trip.defaultCurrency,
      transportMethod: eventForm.transportMethod,
      url: eventForm.url,
      screenshot: eventForm.screenshot,
      expenseParts: (editingEventId && editingEventDate && trip.itinerary[editingEventDate]?.find(i => i.id === editingEventId)?.expenseParts) || []
    };

    const newItinerary = { ...trip.itinerary };

    if (editingEventId && editingEventDate) {
        const sourceList = newItinerary[editingEventDate] || [];
        newItinerary[editingEventDate] = sourceList.filter(i => i.id !== editingEventId);
    }

    const targetDate = eventForm.date;
    const targetList = newItinerary[targetDate] || [];
    const newTargetList = [...targetList, newItem];

    const periodRank = { morning: 0, afternoon: 1, night: 2 };
    newTargetList.sort((a, b) => {
      const rankA = periodRank[a.period || 'morning'];
      const rankB = periodRank[b.period || 'morning'];
      if (rankA !== rankB) return rankA - rankB;
      return (a.time || '').localeCompare(b.time || '');
    });

    newItinerary[targetDate] = newTargetList;

    onUpdate({
      ...trip,
      itinerary: newItinerary
    });
    
    setShowEventModal(false);
    setEditingEventId(null);
    setEditingEventDate(null);
    setEventForm({ title: '', address: '', description: '', time: '', date: eventForm.date, period: 'morning', type: 'sightseeing', estimatedExpense: 0, currency: trip.defaultCurrency, url: '', screenshot: '', lat: undefined, lng: undefined });
  };

  const handleMoveEvent = (eventId: string, sourceDate: string, targetDate: string) => {
    if (sourceDate === targetDate) return;

    const newItinerary = { ...trip.itinerary };
    
    // Remove from source
    const sourceItems = newItinerary[sourceDate] || [];
    const itemToMove = sourceItems.find(i => i.id === eventId);
    if (!itemToMove) return;
    
    newItinerary[sourceDate] = sourceItems.filter(i => i.id !== eventId);

    // Add to target
    const targetItems = newItinerary[targetDate] || [];
    const newItem = { ...itemToMove }; 
    // We retain the original time and period, sorting happens below
    
    const newTargetList = [...targetItems, newItem];
    
    // Sort logic (matching handleSaveEvent)
    const periodRank = { morning: 0, afternoon: 1, night: 2 };
    newTargetList.sort((a, b) => {
      const rankA = periodRank[a.period || 'morning'];
      const rankB = periodRank[b.period || 'morning'];
      if (rankA !== rankB) return rankA - rankB;
      return (a.time || '').localeCompare(b.time || '');
    });

    newItinerary[targetDate] = newTargetList;

    onUpdate({ ...trip, itinerary: newItinerary });
  };

  const handleDeleteEvent = (eventId: string, date: string) => {
    const newItems = (trip.itinerary[date] || []).filter(i => i.id !== eventId);
    onUpdate({
      ...trip,
      itinerary: { ...trip.itinerary, [date]: newItems }
    });
    if (selectedDiscoveryId === eventId) setSelectedDiscoveryId(null);
  };

  const handleEditEvent = (item: ItineraryItem, date: string) => {
    setEditingEventId(item.id);
    setEditingEventDate(date);
    
    let initialPeriod = item.period;
    if (!initialPeriod && item.time) {
        const hour = parseInt(item.time.split(':')[0], 10);
        if (hour >= 12 && hour < 18) initialPeriod = 'afternoon';
        else if (hour >= 18) initialPeriod = 'night';
        else initialPeriod = 'morning';
    }

    setEventForm({ 
        ...item, 
        date: date,
        address: item.address || '',
        period: initialPeriod || 'morning', 
        time: item.time || '',
        url: item.url || '',
        screenshot: item.screenshot || '',
        lat: item.lat,
        lng: item.lng
    });
    setShowEventModal(true);
  };

  // --- Optimization Logic ---
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
  };

  const handleOptimizeRoute = async () => {
    if (isOptimizing) return;
    
    const currentItems = trip.itinerary[selectedDate] || [];
    if (currentItems.length < 2) return;

    setIsOptimizing(true);
    setOptimizationStatus('Analyzing events...');
    setRouteSummary(null);

    // Clone items to process them safely
    const itemsToProcess = currentItems.map(i => ({ ...i }));
    const missingCoords = itemsToProcess.filter(i => i.lat === undefined || i.lng === undefined);

    // 1. Geocode items missing coordinates
    for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        if (item.lat !== undefined && item.lng !== undefined) continue;

        if (missingCoords.length > 0) {
           const idx = missingCoords.findIndex(mc => mc.id === item.id);
           setOptimizationStatus(`Finding location ${idx + 1}/${missingCoords.length}: ${item.title.substring(0, 15)}...`);
        }

        // Try to extract from URL first (High confidence, specific)
        const urlLoc = extractLocationFromUrl(item.url);
        if (urlLoc) {
             // Check if it's lat,lng pattern directly
             const match = urlLoc.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
             if (match) {
                 item.lat = parseFloat(match[1]);
                 item.lng = parseFloat(match[3]);
                 continue; // Found precise coords, skip nominatim
             }
        }

        // Try multiple query strategies in order
        const queries = [];
        if (item.address) queries.push(item.address);
        if (urlLoc) queries.push(urlLoc); // Extracted name/place from URL
        if (item.title) queries.push(item.title);
        // Try description if it's short (might contain address)
        if (item.description && item.description.length < 100) queries.push(item.description);

        if (item.type === 'transport') continue; // Skip vague transport items

        let found = false;
        for (const query of queries) {
            if (!query) continue;
            try {
                // Fetch coords using the Nominatim Service
                const result = await NominatimService.searchPlace(query, trip.location);
                if (result && result.lat !== undefined && result.lng !== undefined) {
                    item.lat = result.lat;
                    item.lng = result.lng;
                    if (!item.address && result.address) {
                        item.address = result.address;
                    }
                    found = true;
                }
            } catch (e) {
                // Ignore and try next query
            }
            
            // STRICT RATE LIMITING: OpenStreetMap requires max 1 request per second.
            // We sleep 1.1s to be safe and respectful to the free service.
            await new Promise(r => setTimeout(r, 1100));
            
            if (found) break; 
        }

        if (!found) {
            console.warn(`Failed to geocode ${item.title} after trying multiple sources.`);
        }
    }

    setOptimizationStatus('Calculating route...');

    // 2. Filter items that have coordinates
    const mappableItems = itemsToProcess.filter(item => item.lat !== undefined && item.lng !== undefined);
    const unmappableItems = itemsToProcess.filter(item => item.lat === undefined || item.lng === undefined);

    if (mappableItems.length < 2) {
      alert("Could not determine enough locations for optimization. Please ensure events have valid addresses, Google Maps URLs, or clear names.");
      setIsOptimizing(false);
      setOptimizationStatus('');
      return;
    }

    // 3. Nearest Neighbor Algorithm
    // Attempt to start with the item closest to "Start" time or just the first item
    // For simplicity, preserve the first mappable item as the start node to anchor the route
    const startNode = mappableItems[0];
    
    let optimized = [startNode];
    let remaining = mappableItems.filter(i => i.id !== startNode.id);

    while (remaining.length > 0) {
      const current = optimized[optimized.length - 1];
      let nearestIndex = -1;
      let minDist = Infinity;

      remaining.forEach((item, index) => {
        const dist = calculateDistance(current.lat!, current.lng!, item.lat!, item.lng!);
        if (dist < minDist) {
          minDist = dist;
          nearestIndex = index;
        }
      });

      if (nearestIndex !== -1) {
        optimized.push(remaining[nearestIndex]);
        remaining.splice(nearestIndex, 1);
      } else {
        break; 
      }
    }

    // 4. Recombine (Mappable first, then others)
    const newOrder = [...optimized, ...unmappableItems];

    onUpdate({
      ...trip,
      itinerary: {
        ...trip.itinerary,
        [selectedDate]: newOrder
      }
    });

    // 5. Generate Route Summary using Groq
    if (newOrder.length > 0) {
      setOptimizationStatus('Generating summary with Groq AI...');
      const locations = newOrder.map(i => i.title);
      const summary = await GroqService.generateRouteIntro(locations, language);
      if (summary) setRouteSummary(summary);
    }
    
    setIsOptimizing(false);
    setOptimizationStatus('');
  };

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, id: string, date: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, date }));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        // Optional: add a class to the dragged item if you want to hide it
    }, 0);
  };

  const onDragOver = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== date) {
      setDragOverDate(date);
    }

    // Auto-scroll logic
    const SCROLL_THRESHOLD = 150;
    const MIN_SCROLL_SPEED = 5;
    const MAX_SCROLL_SPEED = 30;

    if (e.clientY < SCROLL_THRESHOLD) {
      const intensity = (SCROLL_THRESHOLD - e.clientY) / SCROLL_THRESHOLD;
      const speed = MIN_SCROLL_SPEED + (intensity * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED));
      window.scrollBy(0, -speed);
    } else if (e.clientY > window.innerHeight - SCROLL_THRESHOLD) {
      const intensity = (e.clientY - (window.innerHeight - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      const speed = MIN_SCROLL_SPEED + (intensity * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED));
      window.scrollBy(0, speed);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Rely on onDragOver updating the date
  };

  const onDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    
    try {
        const { id, date: sourceDate } = JSON.parse(dataStr);
        if (sourceDate !== targetDate) {
            handleMoveEvent(id, sourceDate, targetDate);
        }
    } catch(err) { console.error(err); }
  };

  const handleEventImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setEventForm(prev => ({ ...prev, screenshot: event.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Map Search Handlers - REPLACED WITH NOMINATIM
  const handleMapSearch = async () => {
    if(!mapSearchQuery) return;
    setIsSearchingMap(true);
    setMapSearchResult(null);
    try {
        // Use Nominatim Service instead of Gemini
        const result = await NominatimService.searchPlace(mapSearchQuery, trip.location);
        if(result) setMapSearchResult(result);
    } catch(e) { console.error(e); }
    finally { setIsSearchingMap(false); }
  };

  const handleAddMapResult = () => {
    if(!mapSearchResult) return;
    setEditingEventId(null);
    setEditingEventDate(selectedDate);
    setEventForm({
        ...eventForm,
        title: mapSearchResult.title || mapSearchQuery,
        address: mapSearchResult.address || '',
        description: mapSearchResult.description || '',
        type: (mapSearchResult.type as any) || 'sightseeing',
        estimatedExpense: mapSearchResult.estimatedExpense || 0,
        currency: mapSearchResult.currency || trip.defaultCurrency,
        date: selectedDate,
        time: '10:00', // default time
        lat: mapSearchResult.lat,
        lng: mapSearchResult.lng
    });
    setMapSearchResult(null);
    setMapSearchQuery('');
    setShowEventModal(true);
  };

  const handleFindHotels = async () => {
    setIsSearchingHotels(true);
    try {
      const allItems = Object.values(trip.itinerary).flat() as ItineraryItem[];
      const hotels = await GeminiService.recommendHotels(trip.location, allItems, hotelPreferences, language);
      onUpdate({ ...trip, hotels: [...(trip.hotels || []), ...hotels] });
    } catch (e) {
      console.error("Hotel search failed", e);
      alert("Could not find hotels. Please try again.");
    } finally {
      setIsSearchingHotels(false);
    }
  };

  const handleHotelAutoFill = async () => {
    if (!hotelUrlInput) return;
    setIsAnalyzingUrl(true);
    try {
      const result = await GeminiService.extractHotelInfo(hotelUrlInput, language);
      if (result) {
         setHotelForm({ ...hotelForm, ...result, website: hotelUrlInput });
      }
    } catch (e) {
      console.error("Auto fill failed", e);
      alert("Could not extract hotel info. Please fill manually.");
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  const handleSaveHotel = () => {
    if (!hotelForm.name) return;
    const newHotel: Hotel = {
       id: editingHotelId || Math.random().toString(36).substr(2, 9),
       name: hotelForm.name,
       description: hotelForm.description || '',
       address: hotelForm.address || '',
       price: hotelForm.price || '',
       rating: hotelForm.rating || 0,
       amenities: hotelForm.amenities || [],
       bookingUrl: hotelForm.bookingUrl,
       checkIn: hotelForm.checkIn,
       checkOut: hotelForm.checkOut,
       roomType: hotelForm.roomType,
       servicesIncluded: hotelForm.servicesIncluded,
       notes: hotelForm.notes,
       website: hotelForm.website
    };
    let updatedHotels = trip.hotels || [];
    if (editingHotelId) {
       updatedHotels = updatedHotels.map(h => h.id === editingHotelId ? newHotel : h);
    } else {
       updatedHotels = [...updatedHotels, newHotel];
    }
    onUpdate({ ...trip, hotels: updatedHotels });
    setShowHotelModal(false);
    setEditingHotelId(null);
    setHotelForm({});
    setHotelUrlInput('');
  };

  const handleDeleteHotel = (id: string) => {
    if(window.confirm("Delete this hotel?")) {
       onUpdate({ ...trip, hotels: (trip.hotels || []).filter(h => h.id !== id) });
    }
  };

  const handleEditHotel = (hotel: Hotel) => {
    setEditingHotelId(hotel.id);
    setHotelForm(hotel);
    setHotelUrlInput(hotel.website || hotel.bookingUrl || '');
    setShowHotelModal(true);
  };

  const handleSaveFlight = () => {
    if (!editingFlightType) return;
    const updatedTrip = { ...trip };
    if (editingFlightType === 'departure') {
      updatedTrip.departureFlight = flightForm;
    } else if (editingFlightType === 'return') {
      updatedTrip.returnFlight = flightForm;
    } else if (editingFlightType === 'complex') {
      const flights = { ...(updatedTrip.flights || {}) };
      const list = [...(flights[editingComplexDate] || [])];
      if (editingComplexIndex >= 0) {
        list[editingComplexIndex] = { ...list[editingComplexIndex], ...flightForm };
      } else {
        list.push({ ...flightForm, label: `Flight ${list.length + 1}` });
      }
      flights[editingComplexDate] = list;
      updatedTrip.flights = flights;
    }
    onUpdate(updatedTrip);
    setShowFlightModal(false);
  };

  // Generate full date range for sorting/overview to ensure empty days are shown
  const sortedDates = useMemo(() => {
    if (!trip.startDate || !trip.endDate) return Object.keys(trip.itinerary).sort();
    
    const dates = [];
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return Object.keys(trip.itinerary).sort();

    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [trip.startDate, trip.endDate, trip.itinerary]);

  const currentItinerary = trip.itinerary[selectedDate] || [];

  // Determine items for map including hotel as start point if not first day
  const itemsForMap = useMemo(() => {
    const isFirstDay = selectedDate === trip.startDate;
    const activeHotel = trip.hotels && trip.hotels.length > 0 ? trip.hotels[0] : null;
    
    if (!isFirstDay && activeHotel) {
        const hotelItem: ItineraryItem = {
            id: 'hotel-start-marker',
            title: activeHotel.name,
            description: 'Starting point',
            address: activeHotel.address,
            url: activeHotel.website || activeHotel.bookingUrl,
            type: 'hotel',
            time: '08:00', // Assumed start time
            estimatedExpense: 0,
            actualExpense: 0
        };
        return [hotelItem, ...currentItinerary];
    }
    return currentItinerary;
  }, [selectedDate, trip.startDate, trip.hotels, currentItinerary]);

  const groupedEvents = {
    morning: currentItinerary.filter(i => (i.period === 'morning' || (!i.period && (!i.time || parseInt(i.time) < 12)))),
    afternoon: currentItinerary.filter(i => (i.period === 'afternoon' || (!i.period && i.time && parseInt(i.time) >= 12 && parseInt(i.time) < 18))),
    night: currentItinerary.filter(i => (i.period === 'night' || (!i.period && i.time && parseInt(i.time) >= 18)))
  };

  const isGoogleMapLink = (url?: string) => {
    if (!url) return false;
    return url.includes('google.com/maps') || url.includes('goo.gl/maps');
  };

  const renderEventCard = (item: ItineraryItem, dateContext: string, isDraggable = false) => (
    <div 
      key={item.id} 
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart(e, item.id, dateContext)}
      onClick={() => setSelectedDiscoveryId(selectedDiscoveryId === item.id ? null : item.id)}
      className={`group relative p-5 rounded-[2rem] border transition-all cursor-pointer 
        ${isDraggable ? 'cursor-grab active:cursor-grabbing hover:shadow-xl active:scale-[0.98]' : 'hover:scale-[1.01] hover:shadow-lg'}
        ${selectedDiscoveryId === item.id ? 'ring-2 ring-indigo-500 scale-[1.02] shadow-xl z-10' : ''} 
        ${darkMode ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-100'}
        ${item.type === 'hotel' ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30' : ''}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner shrink-0 ${
          item.type === 'eating' ? 'bg-orange-100 text-orange-500' :
          item.type === 'sightseeing' ? 'bg-blue-100 text-blue-500' :
          item.type === 'shopping' ? 'bg-pink-100 text-pink-500' :
          item.type === 'transport' ? 'bg-zinc-100 text-zinc-500' : 
          item.type === 'hotel' ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-500'
        }`}>
          {item.type === 'eating' && '🍱'}
          {item.type === 'sightseeing' && '🏛️'}
          {item.type === 'shopping' && '🛍️'}
          {item.type === 'transport' && '🚗'}
          {item.type === 'hotel' && '🏨'}
          {item.type === 'other' && '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h4 className="font-black text-lg truncate pr-2 flex items-center gap-2">
              {item.title}
              {(isGoogleMapLink(item.url) || item.address) && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500 dark:bg-red-900/30" title="Mapped">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                </span>
              )}
            </h4>
            <div className="flex gap-2 shrink-0">
               <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 whitespace-nowrap">
                 {new Date(dateContext).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
               </span>
               <span className="text-[10px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-1 rounded-lg whitespace-nowrap">
                 {item.time || 'Flexible'}
               </span>
            </div>
          </div>
          {item.address && <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>{item.address}</p>}
          {item.description && <p className="text-sm opacity-70 mt-1 line-clamp-2">{item.description}</p>}
          <div className="flex gap-3 mt-3">
             {item.estimatedExpense > 0 && (
               <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                 {item.currency}{item.estimatedExpense}
               </span>
             )}
             {item.transportMethod && (
               <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                 {item.transportMethod}
               </span>
             )}
          </div>
          
          {(item.url || item.screenshot) && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-800 flex flex-wrap gap-2">
               {item.url && (
                 <a href={item.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold hover:underline flex items-center gap-1">
                   🔗 {item.url.length > 20 ? item.url.substring(0, 20) + '...' : item.url}
                 </a>
               )}
               {item.screenshot && (
                 <div className="relative group" onClick={(e) => e.stopPropagation()}>
                    <img 
                      src={item.screenshot} 
                      alt="Screenshot" 
                      className="w-16 h-16 object-cover rounded-xl border-2 border-zinc-100 dark:border-zinc-800 cursor-zoom-in hover:opacity-90 transition-opacity shadow-sm"
                      onClick={(e) => { e.stopPropagation(); setPreviewImage(item.screenshot!); }}
                    />
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
      
      {item.type !== 'hotel' && (
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-xl p-1">
          <button onClick={(e) => { e.stopPropagation(); handleEditEvent(item, dateContext); }} className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(item.id, dateContext); }} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/50 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="relative h-64 md:h-80 rounded-[2.5rem] overflow-hidden shadow-2xl mb-8 group">
        <img src={trip.coverImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={trip.title} />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        
        <div className="absolute top-6 left-6 z-10">
          <button onClick={onBack} className="p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white hover:bg-white/30 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>

        <div className="absolute top-6 right-6 z-10 flex gap-2">
             <button 
                onClick={handleGenerateCover} 
                disabled={isGeneratingCover}
                className="p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white hover:bg-white/30 transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
             >
                {isGeneratingCover ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"/> : '✨'}
                {isGeneratingCover ? t.processing : t.autoCover}
             </button>
        </div>

        <div className="absolute bottom-8 left-8 right-8 text-white">
          {isEditingTitle ? (
             <div className="flex items-center gap-2 mb-2 animate-in fade-in">
                <input 
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="bg-transparent border-b-2 border-white/50 text-4xl font-black text-white outline-none w-full"
                  autoFocus
                />
                <button onClick={handleSaveTitle} className="p-2 bg-white text-black rounded-xl shadow-lg hover:scale-105 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></button>
                <button onClick={() => setIsEditingTitle(false)} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
             </div>
          ) : (
             <div className="flex items-center gap-3 mb-2 group/title">
                <h1 className="text-4xl font-black tracking-tight">{trip.title}</h1>
                <button 
                  onClick={() => { setTitleInput(trip.title); setIsEditingTitle(true); }}
                  className="opacity-0 group-hover/title:opacity-100 p-2 hover:bg-white/20 rounded-xl transition-all text-white/80"
                >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
             </div>
          )}
          
          <div className="flex items-center gap-4 text-sm font-bold opacity-90">
            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg">📍 {trip.location}</span>
            {isEditingDates ? (
               <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg">
                  <input type="date" value={dateForm.start} onChange={e => setDateForm({...dateForm, start: e.target.value})} className="bg-transparent outline-none text-white w-32"/>
                  <span>-</span>
                  <input type="date" value={dateForm.end} onChange={e => setDateForm({...dateForm, end: e.target.value})} className="bg-transparent outline-none text-white w-32"/>
                  <button onClick={handleSaveDates} className="p-1 bg-white text-black rounded hover:scale-105"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></button>
                  <button onClick={() => { setIsEditingDates(false); setDateForm({start: trip.startDate, end: trip.endDate}); }} className="p-1 hover:bg-white/20 rounded"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
               </div>
            ) : (
               <div className="flex items-center gap-2 group/date cursor-pointer" onClick={() => { setDateForm({start: trip.startDate, end: trip.endDate}); setIsEditingDates(true); }}>
                  <span>📅 {trip.startDate} - {trip.endDate}</span>
                  <span className="opacity-0 group-hover/date:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></span>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {(['itinerary', 'accommodation', 'photos', 'info'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab 
              ? 'bg-indigo-600 text-white shadow-lg scale-105' 
              : (darkMode ? 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800' : 'bg-white text-zinc-400 hover:bg-zinc-50')}`}
          >
            {tab === 'itinerary' && t.itinerary}
            {tab === 'accommodation' && t.accommodation}
            {tab === 'photos' && t.tripAlbum}
            {tab === 'info' && t.flightDetails}
          </button>
        ))}
      </div>

      {/* Itinerary View */}
      {activeTab === 'itinerary' && (
        <div className="space-y-6">
          
          {/* Day / Overview Toggle */}
          <div className="flex justify-center mb-6">
             <div className="flex p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800">
               <button 
                 onClick={() => setItineraryView('day')}
                 className={`px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${itineraryView === 'day' ? 'bg-white dark:bg-zinc-700 shadow-md text-indigo-600 dark:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                 Day View
               </button>
               <button 
                 onClick={() => setItineraryView('overview')}
                 className={`px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${itineraryView === 'overview' ? 'bg-white dark:bg-zinc-700 shadow-md text-indigo-600 dark:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                 Overview
               </button>
             </div>
          </div>

          {itineraryView === 'day' && (
            <>
              <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                {sortedDates.map((date, index) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`flex-shrink-0 w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border-2 ${selectedDate === date 
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-xl scale-110' 
                      : (darkMode ? 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700' : 'border-zinc-100 bg-white text-zinc-400 hover:border-zinc-200')}`}
                  >
                    <span className="text-[10px] font-black uppercase">Day {index + 1}</span>
                    <span className="text-xs font-black">{new Date(date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                    {weather && weather[date] && (
                      <span className="text-xs">{weather[date].icon}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Map & Weather Section with Smart Search */}
              <div className={`rounded-[2.5rem] overflow-hidden border-2 transition-all duration-500 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-xl'}`}>
                 <div 
                   className="p-6 flex justify-between items-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                   onClick={() => setShowMap(!showMap)}
                 >
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                       </div>
                       <h3 className="font-black text-lg">Map & Weather</h3>
                    </div>
                    <svg className={`w-5 h-5 transition-transform duration-300 ${showMap ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                 </div>
                 
                 {showMap && (
                   <div className="animate-in slide-in-from-top-4 duration-300">
                     {weather && weather[selectedDate] && (
                       <div className="px-6 pb-6 flex items-center gap-4">
                          <div className="text-4xl">{weather[selectedDate].icon}</div>
                          <div>
                            <div className="font-black text-xl">{weather[selectedDate].temp}</div>
                            <div className="text-xs opacity-60 font-bold uppercase tracking-widest">{weather[selectedDate].condition}</div>
                          </div>
                       </div>
                     )}
                     
                     {/* Smart Map Search Bar - Using Nominatim */}
                     <div className="px-6 pb-4">
                        <div className="flex gap-2">
                           <input 
                             value={mapSearchQuery}
                             onChange={(e) => setMapSearchQuery(e.target.value)}
                             onKeyDown={(e) => e.key === 'Enter' && handleMapSearch()}
                             placeholder="Search place to add (via OpenStreetMap)..."
                             className={`flex-1 p-3 rounded-xl font-bold text-xs outline-none border-2 transition-all ${darkMode ? 'bg-black border-zinc-800 focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500'}`}
                           />
                           <button 
                             onClick={handleMapSearch}
                             disabled={isSearchingMap || !mapSearchQuery}
                             className="px-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50"
                           >
                             {isSearchingMap ? '...' : 'Find'}
                           </button>
                        </div>
                        {mapSearchResult && (
                           <div className={`mt-3 p-3 rounded-xl border-l-4 border-indigo-500 flex justify-between items-center animate-in fade-in ${darkMode ? 'bg-indigo-900/20' : 'bg-indigo-50'}`}>
                              <div>
                                 <div className="font-black text-sm">{mapSearchResult.title}</div>
                                 <div className="text-[10px] opacity-70">{mapSearchResult.address}</div>
                              </div>
                              <button 
                                onClick={handleAddMapResult}
                                className="px-3 py-1.5 bg-white dark:bg-black text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase shadow-sm hover:scale-105 transition-transform"
                              >
                                + Add to Day
                              </button>
                           </div>
                        )}
                     </div>

                     <div className="aspect-video w-full bg-gray-100 dark:bg-zinc-800">
                        <iframe
                          width="100%"
                          height="100%"
                          style={{ border: 0 }}
                          loading="lazy"
                          allowFullScreen
                          src={getMapUrl(trip.location, itemsForMap)}
                        ></iframe>
                     </div>
                   </div>
                 )}
              </div>

              {/* Day specific events */}
              <div className="space-y-4 min-h-[300px]">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-black">{new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                  <button 
                    onClick={() => {
                      setEditingEventId(null);
                      setEditingEventDate(selectedDate);
                      setEventForm({ title: '', address: '', description: '', time: '', date: selectedDate, period: 'morning', type: 'sightseeing', estimatedExpense: 0, currency: trip.defaultCurrency, url: '', screenshot: '', lat: undefined, lng: undefined });
                      setShowEventModal(true);
                    }}
                    className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform"
                  >
                    + {t.addEvent}
                  </button>
                </div>

                {/* Groq Route Summary */}
                {routeSummary && (
                  <div className="mx-2 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 animate-in fade-in slide-in-from-top-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-black text-[10px] uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                          Route Intro
                        </h4>
                        <p className="text-sm font-medium leading-relaxed opacity-80">{routeSummary}</p>
                      </div>
                      <button onClick={() => setRouteSummary(null)} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
                        <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                )}

                {itemsForMap.length === 0 ? (
                  <div className={`p-12 text-center rounded-[2.5rem] border-2 border-dashed ${darkMode ? 'border-zinc-800 text-zinc-600' : 'border-zinc-200 text-zinc-400'}`}>
                    <p className="font-bold">No events planned for this day.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Render Hotel as Start Point if available */}
                    {itemsForMap[0].type === 'hotel' && (
                       <div className="space-y-4 animate-in slide-in-from-left-4 duration-500">
                          <div className="flex items-center gap-2 px-2">
                             <span className="text-xl">🛌</span>
                             <h4 className="font-black uppercase tracking-widest text-sm opacity-60">Start</h4>
                          </div>
                          {renderEventCard(itemsForMap[0], selectedDate)}
                       </div>
                    )}

                    {groupedEvents.morning.length > 0 && (
                      <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-100">
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xl">🌅</span>
                          <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.morning}</h4>
                        </div>
                        {groupedEvents.morning.map(item => renderEventCard(item, selectedDate))}
                      </div>
                    )}
                    {groupedEvents.afternoon.length > 0 && (
                      <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-200">
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xl">☀️</span>
                          <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.afternoon}</h4>
                        </div>
                        {groupedEvents.afternoon.map(item => renderEventCard(item, selectedDate))}
                      </div>
                    )}
                    {groupedEvents.night.length > 0 && (
                      <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-300">
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xl">🌙</span>
                          <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.night}</h4>
                        </div>
                        {groupedEvents.night.map(item => renderEventCard(item, selectedDate))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {itineraryView === 'overview' && (
            <div className="space-y-12 animate-in fade-in">
                {sortedDates.map((date) => {
                   const items = trip.itinerary[date] || [];
                   
                   const isFirstDay = date === trip.startDate;
                   const activeHotel = trip.hotels && trip.hotels.length > 0 ? trip.hotels[0] : null;
                   
                   // Sort user items by time within the day
                   const sortedItems = [...items].sort((a, b) => {
                      const timeA = a.time || '00:00';
                      const timeB = b.time || '00:00';
                      return timeA.localeCompare(timeB);
                   });

                   let displayItems = sortedItems;

                   // Inject Hotel as start point if not first day
                   if (!isFirstDay && activeHotel) {
                      const hotelItem: ItineraryItem = {
                          id: `hotel-start-overview-${date}`,
                          title: activeHotel.name,
                          description: 'Starting point',
                          address: activeHotel.address,
                          url: activeHotel.website || activeHotel.bookingUrl,
                          type: 'hotel',
                          time: '08:00', 
                          estimatedExpense: 0,
                          actualExpense: 0,
                          currency: trip.defaultCurrency
                      };
                      displayItems = [hotelItem, ...sortedItems];
                   }

                   return (
                     <div 
                        key={date} 
                        onDragOver={(e) => onDragOver(e, date)}
                        onDrop={(e) => onDrop(e, date)}
                        className={`relative pl-8 transition-colors rounded-2xl p-4 min-h-[160px]
                          ${dragOverDate === date ? 'bg-indigo-50 dark:bg-indigo-900/10 border-2 border-indigo-500 border-dashed' : 'border-l-2 border-dashed border-zinc-200 dark:border-zinc-800'}`}
                     >
                        <div className="absolute -left-2.5 top-4 w-5 h-5 rounded-full bg-indigo-600 border-4 border-white dark:border-zinc-950 shadow-sm" />
                        <h3 className="text-2xl font-black mb-6">{new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                        
                        {displayItems.length > 0 ? (
                           <div className="space-y-4">
                              {displayItems.map(item => renderEventCard(item, date, item.type !== 'hotel'))}
                           </div>
                        ) : (
                           <div className="py-8 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-300 dark:text-zinc-700">
                              <p className="text-xs font-black uppercase tracking-widest">Drop events here</p>
                           </div>
                        )}
                     </div>
                   );
                })}
                <div className="flex justify-center pt-8">
                   <button 
                    onClick={() => {
                      setEditingEventId(null);
                      setEditingEventDate(sortedDates[0] || trip.startDate);
                      setEventForm({ title: '', address: '', description: '', time: '', date: sortedDates[0] || trip.startDate, period: 'morning', type: 'sightseeing', estimatedExpense: 0, currency: trip.defaultCurrency, url: '', screenshot: '', lat: undefined, lng: undefined });
                      setShowEventModal(true);
                    }}
                    className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
                   >
                     + {t.addEvent}
                   </button>
                </div>
            </div>
          )}
          
          <div className="pt-4 flex justify-center gap-3 flex-wrap">
               <button
                 onClick={handleOptimizeRoute}
                 disabled={isOptimizing}
                 className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-black text-xs uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-sm disabled:opacity-50"
                 title="Reorders events by shortest distance. Uses OpenStreetMap."
               >
                 {isOptimizing ? (
                   <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 ) : (
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                 )}
                 {isOptimizing ? (optimizationStatus || 'Optimizing...') : 'Optimize Order'}
               </button>

               {selectedDiscoveryId ? (
                 <button
                   onClick={() => setShowDiscoveryModal(true)}
                   className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 hover:scale-105 transition-all animate-in zoom-in"
                 >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                   {t.discoverNearby}
                 </button>
               ) : (
                 <a 
                   href={getExternalMapsUrl(trip.location, itemsForMap)}
                   target="_blank"
                   rel="noreferrer" 
                   className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                 >
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                   {t.viewOnGoogleMaps}
                 </a>
               )}
            </div>
        </div>
      )}

      {/* Accommodation Tab */}
      {activeTab === 'accommodation' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           {/* Saved Hotels List */}
           {trip.hotels && trip.hotels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {trip.hotels.map((hotel) => (
                  <div key={hotel.id} className={`p-6 rounded-[2.5rem] border group relative overflow-hidden transition-all hover:shadow-xl ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                         <h4 className="font-black text-xl leading-tight mb-1">{hotel.name}</h4>
                         {hotel.address && (
                           <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                             {hotel.address}
                           </div>
                         )}
                         <div className="flex items-center gap-2 text-xs font-bold opacity-60">
                           {hotel.rating > 0 && <span className="text-yellow-500">★ {hotel.rating}</span>}
                           {hotel.price && <span>• {hotel.price}</span>}
                         </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => handleEditHotel(hotel)} className="p-2 bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                         <button onClick={() => handleDeleteHotel(hotel.id)} className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                       {hotel.checkIn && <div className="flex justify-between border-b border-dashed pb-1 border-opacity-20 border-gray-500"><span>Check-in:</span> <span className="font-bold">{hotel.checkIn}</span></div>}
                       {hotel.checkOut && <div className="flex justify-between border-b border-dashed pb-1 border-opacity-20 border-gray-500"><span>Check-out:</span> <span className="font-bold">{hotel.checkOut}</span></div>}
                       {hotel.roomType && <div className="flex justify-between border-b border-dashed pb-1 border-opacity-20 border-gray-500"><span>Room:</span> <span className="font-bold">{hotel.roomType}</span></div>}
                    </div>

                    {(hotel.website || hotel.bookingUrl) && (
                      <div className="mt-4">
                        <a href={hotel.website || hotel.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-500 hover:underline">
                          🔗 Visit Website
                        </a>
                      </div>
                    )}

                    {hotel.servicesIncluded && (
                      <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs">
                        <span className="font-bold block mb-1">Included:</span>
                        {hotel.servicesIncluded}
                      </div>
                    )}

                    {hotel.notes && (
                       <p className="mt-4 text-xs opacity-60 italic">"{hotel.notes}"</p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                       {hotel.amenities.map(tag => (
                         <span key={tag} className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold uppercase tracking-wider opacity-70">{tag}</span>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
           ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-[2.5rem] opacity-40">
                <p className="font-bold">No hotels added yet.</p>
              </div>
           )}

           {/* AI Recommendations Section */}
           <div className={`p-6 rounded-[2.5rem] border-2 space-y-4 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
              <h4 className="text-lg font-black">{t.findHotels}</h4>
              <div className="flex flex-col md:flex-row gap-4">
                 <div className="flex-1">
                    <input 
                      value={hotelPreferences}
                      onChange={(e) => setHotelPreferences(e.target.value)}
                      placeholder={t.hotelPlaceholder}
                      className={`w-full p-4 rounded-2xl font-bold outline-none border-2 transition-all ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500'}`}
                    />
                 </div>
                 <button 
                   onClick={handleFindHotels}
                   disabled={isSearchingHotels}
                   className="px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                   {isSearchingHotels ? <span className="animate-spin">⏳</span> : '✨'}
                   {isSearchingHotels ? t.analyzingPlan : t.findHotels}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Photos Tab */}
      {activeTab === 'photos' && (
        <div className="animate-in fade-in duration-500 grid grid-cols-2 md:grid-cols-3 gap-4 pb-20">
           {trip.photos.length > 0 ? trip.photos.map(photo => (
             <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer" onClick={() => onEditPhoto(photo)}>
                <img src={photo.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                   <p className="text-white text-xs font-bold truncate">{photo.caption}</p>
                </div>
             </div>
           )) : (
             <div className="col-span-full py-12 text-center opacity-50 font-bold">
               {t.noMemories}
             </div>
           )}
        </div>
      )}

      {/* Flight & Transport Info Tab */}
      {activeTab === 'info' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           {/* ... existing flight code ... */}
           <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black">{t.flightDetails}</h3>
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.transportPlan}</p>
              </div>
              <button
                onClick={() => {
                   setEditingFlightType('complex');
                   setEditingComplexDate(trip.startDate);
                   setEditingComplexIndex(-1);
                   setFlightForm({ code: '', airport: '', gate: '', transport: '', departureTime: '', arrivalTime: '' });
                   setShowFlightModal(true);
                }}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform"
              >
                + Add Flight
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Departure */}
              {trip.departureFlight && (
                 <div className={`p-6 rounded-[2.5rem] border relative group ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                       <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest">{t.departure}</span>
                       <button onClick={() => { setEditingFlightType('departure'); setFlightForm(trip.departureFlight!); setShowFlightModal(true); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                    </div>
                    {/* ... details ... */}
                    <div className="space-y-4">
                       <div>
                          <div className="text-xs opacity-50 uppercase tracking-widest">{t.flightCode}</div>
                          <div className="text-2xl font-black">{trip.departureFlight.code || 'N/A'}</div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.airport}</div>
                             <div className="font-bold">{trip.departureFlight.airport || 'N/A'}</div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.gate}</div>
                             <div className="font-bold">{trip.departureFlight.gate || 'N/A'}</div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.depTime}</div>
                             <div className="font-bold">
                               {trip.departureFlight.departureTime || (
                                 <button 
                                   onClick={() => { setEditingFlightType('departure'); setFlightForm(trip.departureFlight!); setShowFlightModal(true); }}
                                   className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                 >
                                   + Set
                                 </button>
                               )}
                             </div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.arrTime}</div>
                             <div className="font-bold">
                               {trip.departureFlight.arrivalTime || (
                                 <button 
                                   onClick={() => { setEditingFlightType('departure'); setFlightForm(trip.departureFlight!); setShowFlightModal(true); }}
                                   className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                 >
                                   + Set
                                 </button>
                               )}
                             </div>
                          </div>
                       </div>
                       <div>
                          <div className="text-xs opacity-50 uppercase tracking-widest">{t.transport}</div>
                          <div className="font-bold">{trip.departureFlight.transport || 'N/A'}</div>
                       </div>
                    </div>
                 </div>
              )}

              {/* Complex/Other Flights */}
              {trip.flights && Object.entries(trip.flights).map(([date, flights]) => (
                 (flights as FlightInfo[]).map((flight, idx) => (
                    <div key={`${date}-${idx}`} className={`p-6 rounded-[2.5rem] border relative group ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                       <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 text-[10px] font-black uppercase tracking-widest">{flight.label || date}</span>
                          <div className="flex gap-1">
                             <button onClick={() => { setEditingFlightType('complex'); setEditingComplexDate(date); setEditingComplexIndex(idx); setFlightForm(flight); setShowFlightModal(true); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                             <button onClick={() => {
                                 const newFlights = { ...trip.flights };
                                 const list = [...(newFlights[date] || [])];
                                 list.splice(idx, 1);
                                 if (list.length === 0) delete newFlights[date];
                                 else newFlights[date] = list;
                                 onUpdate({ ...trip, flights: newFlights });
                             }} className="p-2 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                          </div>
                       </div>
                       <div className="space-y-4">
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.flightCode}</div>
                             <div className="text-2xl font-black">{flight.code || 'N/A'}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <div className="text-xs opacity-50 uppercase tracking-widest">{t.airport}</div>
                                <div className="font-bold">{flight.airport || 'N/A'}</div>
                             </div>
                             <div>
                                <div className="text-xs opacity-50 uppercase tracking-widest">{t.gate}</div>
                                <div className="font-bold">{flight.gate || 'N/A'}</div>
                             </div>
                             {/* ... times ... */}
                             <div>
                                <div className="text-xs opacity-50 uppercase tracking-widest">{t.depTime}</div>
                                <div className="font-bold">
                                   {flight.departureTime || (
                                     <button 
                                       onClick={() => { setEditingFlightType('complex'); setEditingComplexDate(date); setEditingComplexIndex(idx); setFlightForm(flight); setShowFlightModal(true); }}
                                       className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                     >
                                       + Set
                                     </button>
                                   )}
                                </div>
                             </div>
                             <div>
                                <div className="text-xs opacity-50 uppercase tracking-widest">{t.arrTime}</div>
                                <div className="font-bold">
                                   {flight.arrivalTime || (
                                     <button 
                                       onClick={() => { setEditingFlightType('complex'); setEditingComplexDate(date); setEditingComplexIndex(idx); setFlightForm(flight); setShowFlightModal(true); }}
                                       className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                     >
                                       + Set
                                     </button>
                                   )}
                                </div>
                             </div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.transport}</div>
                             <div className="font-bold">{flight.transport || 'N/A'}</div>
                          </div>
                       </div>
                    </div>
                 ))
              ))}

              {/* Return */}
              {trip.returnFlight && (
                 <div className={`p-6 rounded-[2.5rem] border relative group ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                       <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest">{t.return}</span>
                       <button onClick={() => { setEditingFlightType('return'); setFlightForm(trip.returnFlight!); setShowFlightModal(true); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                    </div>
                    {/* ... details ... */}
                    <div className="space-y-4">
                       <div>
                          <div className="text-xs opacity-50 uppercase tracking-widest">{t.flightCode}</div>
                          <div className="text-2xl font-black">{trip.returnFlight.code || 'N/A'}</div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.airport}</div>
                             <div className="font-bold">{trip.returnFlight.airport || 'N/A'}</div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.gate}</div>
                             <div className="font-bold">{trip.returnFlight.gate || 'N/A'}</div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.depTime}</div>
                             <div className="font-bold">
                               {trip.returnFlight.departureTime || (
                                 <button 
                                   onClick={() => { setEditingFlightType('return'); setFlightForm(trip.returnFlight!); setShowFlightModal(true); }}
                                   className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                 >
                                   + Set
                                 </button>
                               )}
                             </div>
                          </div>
                          <div>
                             <div className="text-xs opacity-50 uppercase tracking-widest">{t.arrTime}</div>
                             <div className="font-bold">
                               {trip.returnFlight.arrivalTime || (
                                 <button 
                                   onClick={() => { setEditingFlightType('return'); setFlightForm(trip.returnFlight!); setShowFlightModal(true); }}
                                   className="text-indigo-500 hover:text-indigo-600 hover:underline text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md transition-colors"
                                 >
                                   + Set
                                 </button>
                               )}
                             </div>
                          </div>
                       </div>
                       <div>
                          <div className="text-xs opacity-50 uppercase tracking-widest">{t.transport}</div>
                          <div className="font-bold">{trip.returnFlight.transport || 'N/A'}</div>
                       </div>
                    </div>
                 </div>
              )}
           </div>

           {/* Planning Resources Section */}
           <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
              <h3 className="text-2xl font-black mb-6">Planning Resources</h3>
              
              {trip.resources && trip.resources.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trip.resources.map(resource => (
                    <a 
                      key={resource.id} 
                      href={resource.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className={`flex gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.01] hover:shadow-lg ${darkMode ? 'bg-black border-zinc-800 hover:border-zinc-700' : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'}`}
                    >
                      <div className="w-24 h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0 overflow-hidden">
                        {resource.image ? (
                          <img src={resource.image} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🔗</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="font-bold text-base truncate mb-1">{resource.title}</div>
                        <div className="text-xs opacity-50 truncate flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          {resource.url}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border-2 border-dashed rounded-2xl opacity-40">
                  <p className="font-bold text-sm">No resources added during planning.</p>
                </div>
              )}
           </div>
        </div>
      )}

      {/* Discovery Modal - REPLACED WITH DIRECT LINKS */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDiscoveryModal(false)} />
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">{t.discoverNearby}</h3>
             
             <div className="grid grid-cols-1 gap-3">
               <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-xs font-bold leading-relaxed border border-indigo-100 dark:border-indigo-900/30">
                 Tap below to open Google Maps search in a new tab. Results are based on your current day's events or trip location.
               </div>
               
               {['eating', 'sightseeing', 'shopping', 'cafes', 'bars'].map(cat => {
                 // Determine context: Try to find a selected event, otherwise trip location
                 let query = `${cat}`;
                 let context = trip.location;
                 
                 // If an event is "selected" (expanded), search near it
                 if (selectedDiscoveryId) {
                   const evt = trip.itinerary[selectedDate]?.find(i => i.id === selectedDiscoveryId);
                   if (evt) {
                     context = evt.title; // Search near the event name
                   }
                 }

                 return (
                  <a
                    key={cat}
                    href={`https://www.google.com/maps/search/${cat}+near+${encodeURIComponent(context)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-98 ${darkMode ? 'bg-black border-zinc-800 hover:border-zinc-600' : 'bg-white border-zinc-200 hover:shadow-lg'}`}
                  >
                    <span className="font-black text-sm uppercase tracking-widest flex items-center gap-3">
                      {cat === 'eating' && '🍱 Find Food'}
                      {cat === 'sightseeing' && '🏛️ Find Sights'}
                      {cat === 'shopping' && '🛍️ Find Shops'}
                      {cat === 'cafes' && '☕ Find Cafes'}
                      {cat === 'bars' && '🍸 Find Bars'}
                    </span>
                    <svg className="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </a>
                 );
               })}
             </div>
             
             <div className="mt-6 text-center">
               <button onClick={() => setShowDiscoveryModal(false)} className="text-xs font-bold opacity-50 hover:opacity-100">Close</button>
             </div>
          </div>
        </div>
      )}

      {/* Hotel Add/Edit Modal */}
      {showHotelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHotelModal(false)} />
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">{editingHotelId ? 'Edit Hotel' : t.addHotel}</h3>
             
             {/* Auto-Fill Section */}
             <div className={`p-4 rounded-2xl border-2 mb-6 space-y-3 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.hotelUrl}</label>
                <div className="flex gap-2">
                   <input 
                     value={hotelUrlInput}
                     onChange={e => setHotelUrlInput(e.target.value)}
                     placeholder="https://..."
                     className={`flex-1 p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
                   />
                   <button 
                     onClick={handleHotelAutoFill}
                     disabled={isAnalyzingUrl || !hotelUrlInput}
                     className="px-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
                   >
                     {isAnalyzingUrl ? '...' : t.autoFill}
                   </button>
                </div>
                <p className="text-[10px] opacity-50">Paste a hotel website or booking link to auto-fill details.</p>
             </div>

             <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.hotelName}</label>
                   <input value={hotelForm.name || ''} onChange={e => setHotelForm({...hotelForm, name: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Address / Location</label>
                   <input 
                     value={hotelForm.address || ''} 
                     onChange={e => setHotelForm({...hotelForm, address: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                     placeholder="Street Address or Map Location"
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Website / Map Link</label>
                   <input 
                     value={hotelForm.website || ''} 
                     onChange={e => setHotelForm({...hotelForm, website: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                     placeholder="https://..."
                   />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.checkInTime}</label>
                     <input value={hotelForm.checkIn || ''} onChange={e => setHotelForm({...hotelForm, checkIn: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} placeholder="15:00" />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.checkOutTime}</label>
                     <input value={hotelForm.checkOut || ''} onChange={e => setHotelForm({...hotelForm, checkOut: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} placeholder="11:00" />
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.roomType}</label>
                   <input value={hotelForm.roomType || ''} onChange={e => setHotelForm({...hotelForm, roomType: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.servicesIncluded}</label>
                   <input value={hotelForm.servicesIncluded || ''} onChange={e => setHotelForm({...hotelForm, servicesIncluded: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} placeholder="e.g. Breakfast, WiFi, Spa Access" />
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.notes}</label>
                   <textarea value={hotelForm.notes || ''} onChange={e => setHotelForm({...hotelForm, notes: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 h-24 resize-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Price</label>
                     <input value={hotelForm.price || ''} onChange={e => setHotelForm({...hotelForm, price: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Rating</label>
                     <input type="number" step="0.1" value={hotelForm.rating || ''} onChange={e => setHotelForm({...hotelForm, rating: parseFloat(e.target.value)})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowHotelModal(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-black uppercase text-xs">{t.cancel}</button>
                  <button onClick={handleSaveHotel} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg">{t.save}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Flight Modal */}
      {showFlightModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFlightModal(false)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">
                {editingFlightType === 'departure' ? 'Departure Flight' : editingFlightType === 'return' ? 'Return Flight' : (editingComplexIndex === -1 ? 'Add Flight' : 'Edit Flight')}
             </h3>
             <div className="space-y-4">
                {editingFlightType === 'complex' && (
                   <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Date</label>
                      <input type="date" value={editingComplexDate} onChange={e => setEditingComplexDate(e.target.value)} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                   </div>
                )}
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.flightCode}</label>
                   <input value={flightForm.code} onChange={e => setFlightForm({...flightForm, code: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.airport}</label>
                   <input value={flightForm.airport} onChange={e => setFlightForm({...flightForm, airport: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.gate}</label>
                   <input value={flightForm.gate} onChange={e => setFlightForm({...flightForm, gate: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.depTime}</label>
                     <input type="time" value={flightForm.departureTime || ''} onChange={e => setFlightForm({...flightForm, departureTime: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.arrTime}</label>
                     <input type="time" value={flightForm.arrivalTime || ''} onChange={e => setFlightForm({...flightForm, arrivalTime: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                   </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.transport}</label>
                   <input value={flightForm.transport} onChange={e => setFlightForm({...flightForm, transport: e.target.value})} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowFlightModal(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-black uppercase text-xs">{t.cancel}</button>
                  <button onClick={handleSaveFlight} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg">{t.save}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEventModal(false)} />
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">{editingEventId ? t.updateEvent : t.addEvent}</h3>
             
             <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.eventName}</label>
                   <input 
                     value={eventForm.title} 
                     onChange={e => setEventForm({...eventForm, title: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>

                {/* New Address Field */}
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Address / Location Name</label>
                   <input 
                     value={eventForm.address} 
                     onChange={e => setEventForm({...eventForm, address: e.target.value})} 
                     placeholder="Specific place name or address for map"
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Date</label>
                     <input 
                       type="date" 
                       value={eventForm.date} 
                       onChange={e => setEventForm({...eventForm, date: e.target.value})} 
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.time}</label>
                     <input 
                       type="time" 
                       value={eventForm.time || ''} 
                       onChange={e => setEventForm({...eventForm, time: e.target.value})} 
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                     />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.period}</label>
                     <select 
                       value={eventForm.period || 'morning'} 
                       onChange={e => setEventForm({...eventForm, period: e.target.value as any})} 
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                     >
                        <option value="morning">{t.morning}</option>
                        <option value="afternoon">{t.afternoon}</option>
                        <option value="night">{t.night}</option>
                     </select>
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.category}</label>
                     <select 
                       value={eventForm.type} 
                       onChange={e => setEventForm({...eventForm, type: e.target.value as any})} 
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                     >
                        <option value="sightseeing">Sightseeing</option>
                        <option value="eating">Eating</option>
                        <option value="shopping">Shopping</option>
                        <option value="transport">Transport</option>
                        <option value="other">Other</option>
                     </select>
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Notes / Description</label>
                   <textarea 
                     value={eventForm.description} 
                     onChange={e => setEventForm({...eventForm, description: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 h-24 resize-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>

                {/* Refined Resources Section */}
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Resources</label>
                   <div className="flex gap-2">
                      <input 
                        value={eventForm.url || ''}
                        onChange={e => setEventForm({...eventForm, url: e.target.value})}
                        placeholder="http://..."
                        className={`flex-1 p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                      />
                      <label className={`p-3 rounded-xl border-2 cursor-pointer flex items-center justify-center transition-colors ${darkMode ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'}`}>
                        <svg className="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <input type="file" accept="image/*" className="hidden" onChange={handleEventImageUpload} />
                      </label>
                   </div>
                   {eventForm.screenshot && (
                      <div className="relative mt-2 w-full h-32 rounded-xl overflow-hidden border-2 border-zinc-200 dark:border-zinc-800 group">
                         <img src={eventForm.screenshot} className="w-full h-full object-cover" />
                         <button 
                           onClick={() => setEventForm({...eventForm, screenshot: ''})} 
                           className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                         </button>
                      </div>
                   )}
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated} ({trip.defaultCurrency})</label>
                   <input 
                     type="number" 
                     value={eventForm.estimatedExpense} 
                     onChange={e => setEventForm({...eventForm, estimatedExpense: parseFloat(e.target.value) || 0})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowEventModal(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-black uppercase text-xs">{t.cancel}</button>
                  <button onClick={handleSaveEvent} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg">{t.save}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Image Preview Lightbox */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button className="absolute top-6 right-6 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <img 
            src={previewImage} 
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" 
            onClick={e => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
};

export default TripDetail;
