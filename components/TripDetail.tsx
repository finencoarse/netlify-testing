
import React, { useState, useEffect } from 'react';
import { Trip, ItineraryItem, Photo, Language, UserProfile, FlightInfo, Hotel } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';
import { getExternalMapsUrl, getMapUrl } from '../services/mapsService';

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
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
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
  const [flightForm, setFlightForm] = useState<FlightInfo>({ code: '', airport: '', gate: '', transport: '' });

  // Map & AI State
  const [showMap, setShowMap] = useState(true);
  const [weather, setWeather] = useState<Record<string, { icon: string, temp: string, condition: string }> | null>(null);
  const [smartRoute, setSmartRoute] = useState<{ text: string, links: { uri: string; title: string }[] } | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Discover Nearby State
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Hotel Recommendation & Management State
  const [hotelPreferences, setHotelPreferences] = useState('');
  const [isSearchingHotels, setIsSearchingHotels] = useState(false);
  const [showHotelModal, setShowHotelModal] = useState(false);
  const [hotelForm, setHotelForm] = useState<Partial<Hotel>>({});
  const [hotelUrlInput, setHotelUrlInput] = useState('');
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);

  // Event Form State
  const [eventForm, setEventForm] = useState<Partial<ItineraryItem>>({
    title: '',
    description: '',
    time: '',
    period: 'morning',
    type: 'sightseeing',
    estimatedExpense: 0,
    transportMethod: '',
    url: ''
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

  // Fetch Weather - Fixed logic to ensure it runs
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
    
    // Helper to calculate date difference
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
    if (!selectedDate || !eventForm.title) return;
    
    let finalPeriod = eventForm.period;
    // If no period is explicitly selected, try to infer from time, otherwise default to morning
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
      description: eventForm.description || '',
      time: eventForm.time || '', // Allow empty time string
      period: finalPeriod as 'morning' | 'afternoon' | 'night',
      type: eventForm.type || 'sightseeing',
      estimatedExpense: eventForm.estimatedExpense || 0,
      actualExpense: 0,
      currency: trip.defaultCurrency,
      transportMethod: eventForm.transportMethod,
      url: eventForm.url,
      expenseParts: (editingEventId && trip.itinerary[selectedDate]?.find(i => i.id === editingEventId)?.expenseParts) || []
    };

    const currentItems = trip.itinerary[selectedDate] || [];
    let newItems;
    if (editingEventId) {
      newItems = currentItems.map(item => item.id === editingEventId ? { ...item, ...newItem } : item);
    } else {
      newItems = [...currentItems, newItem];
    }

    // Sort items
    const periodRank = { morning: 0, afternoon: 1, night: 2 };
    newItems.sort((a, b) => {
      const rankA = periodRank[a.period || 'morning'];
      const rankB = periodRank[b.period || 'morning'];
      if (rankA !== rankB) return rankA - rankB;
      return (a.time || '').localeCompare(b.time || '');
    });

    onUpdate({
      ...trip,
      itinerary: { ...trip.itinerary, [selectedDate]: newItems }
    });
    setShowEventModal(false);
    setEditingEventId(null);
    setEventForm({ title: '', description: '', time: '', period: 'morning', type: 'sightseeing', estimatedExpense: 0 });
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!selectedDate) return;
    const newItems = trip.itinerary[selectedDate].filter(i => i.id !== eventId);
    onUpdate({
      ...trip,
      itinerary: { ...trip.itinerary, [selectedDate]: newItems }
    });
    if (selectedDiscoveryId === eventId) setSelectedDiscoveryId(null);
  };

  const handleEditEvent = (item: ItineraryItem) => {
    setEditingEventId(item.id);
    
    // Infer period if missing but time exists, for legacy data compatibility
    let initialPeriod = item.period;
    if (!initialPeriod && item.time) {
        const hour = parseInt(item.time.split(':')[0], 10);
        if (hour >= 12 && hour < 18) initialPeriod = 'afternoon';
        else if (hour >= 18) initialPeriod = 'night';
        else initialPeriod = 'morning';
    }

    setEventForm({ ...item, period: initialPeriod || 'morning', time: item.time || '' });
    setShowEventModal(true);
  };

  const handleSmartRoute = async () => {
    setIsOptimizing(true);
    setSmartRoute(null);
    try {
      const items = (trip.itinerary[selectedDate] || []) as ItineraryItem[];
      const result = await GeminiService.getMapRoute(trip.location, items, language);
      setSmartRoute(result);
    } catch (e) {
      console.error(e);
      alert('Could not generate smart route. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDiscoverNearby = async (category: string) => {
    const originEvent = trip.itinerary[selectedDate]?.find(i => i.id === selectedDiscoveryId);
    if (!originEvent) return;
    setIsDiscovering(true);
    setDiscoveryResults([]);
    try {
      const query = category === 'eating' ? 'restaurants' : category === 'shopping' ? 'shops' : 'attractions';
      const results = await GeminiService.discoverPlaces(trip.location, `${query} near ${originEvent.title}`, language);
      setDiscoveryResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddDiscovery = (place: any) => {
    const newItem: ItineraryItem = {
      id: Date.now().toString(),
      title: place.title,
      description: place.description || 'Discovered nearby',
      type: place.type || 'sightseeing',
      estimatedExpense: place.estimatedExpense || 0,
      actualExpense: 0,
      currency: trip.defaultCurrency,
      time: '', 
      period: 'afternoon'
    };
    const currentItems = trip.itinerary[selectedDate] || [];
    const newItems = [...currentItems, newItem];
    onUpdate({
      ...trip,
      itinerary: { ...trip.itinerary, [selectedDate]: newItems }
    });
    setShowDiscoveryModal(false);
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
         setHotelForm({
           ...hotelForm,
           ...result,
           website: hotelUrlInput
         });
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
      }
      flights[editingComplexDate] = list;
      updatedTrip.flights = flights;
    }
    onUpdate(updatedTrip);
    setShowFlightModal(false);
  };

  const sortedDates = Object.keys(trip.itinerary).sort();
  const currentItinerary = trip.itinerary[selectedDate] || [];

  const groupedEvents = {
    morning: currentItinerary.filter(i => (i.period === 'morning' || (!i.period && (!i.time || parseInt(i.time) < 12)))),
    afternoon: currentItinerary.filter(i => (i.period === 'afternoon' || (!i.period && i.time && parseInt(i.time) >= 12 && parseInt(i.time) < 18))),
    night: currentItinerary.filter(i => (i.period === 'night' || (!i.period && i.time && parseInt(i.time) >= 18)))
  };

  const renderEventCard = (item: ItineraryItem) => (
    <div 
      key={item.id} 
      onClick={() => setSelectedDiscoveryId(selectedDiscoveryId === item.id ? null : item.id)}
      className={`group relative p-5 rounded-[2rem] border transition-all cursor-pointer ${selectedDiscoveryId === item.id ? 'ring-2 ring-indigo-500 scale-[1.02] shadow-xl z-10' : 'hover:scale-[1.01] hover:shadow-lg'} ${darkMode ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-100'}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner shrink-0 ${
          item.type === 'eating' ? 'bg-orange-100 text-orange-500' :
          item.type === 'sightseeing' ? 'bg-blue-100 text-blue-500' :
          item.type === 'shopping' ? 'bg-pink-100 text-pink-500' :
          item.type === 'transport' ? 'bg-zinc-100 text-zinc-500' : 'bg-purple-100 text-purple-500'
        }`}>
          {item.type === 'eating' && '🍱'}
          {item.type === 'sightseeing' && '🏛️'}
          {item.type === 'shopping' && '🛍️'}
          {item.type === 'transport' && '🚗'}
          {item.type === 'other' && '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h4 className="font-black text-lg truncate pr-2">{item.title}</h4>
            <span className="text-xs font-mono font-bold opacity-50 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg whitespace-nowrap">{item.time || 'Flexible'}</span>
          </div>
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
        </div>
      </div>
      
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); handleEditEvent(item); }} className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-lg hover:text-indigo-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(item.id); }} className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-lg hover:text-rose-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
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

          {/* Map & Weather Section */}
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
                 {/* Weather Strip */}
                 {weather && weather[selectedDate] && (
                   <div className="px-6 pb-6 flex items-center gap-4">
                      <div className="text-4xl">{weather[selectedDate].icon}</div>
                      <div>
                        <div className="font-black text-xl">{weather[selectedDate].temp}</div>
                        <div className="text-xs opacity-60 font-bold uppercase tracking-widest">{weather[selectedDate].condition}</div>
                      </div>
                   </div>
                 )}

                 {/* Google Map Embed */}
                 <div className="aspect-video w-full bg-gray-100 dark:bg-zinc-800">
                    <iframe
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      src={getMapUrl(trip.location, currentItinerary)}
                    ></iframe>
                 </div>

                 {/* Smart Route AI */}
                 <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center">
                       <h4 className="font-bold text-sm uppercase tracking-widest opacity-60">{t.smartRoute}</h4>
                       <button 
                         onClick={handleSmartRoute}
                         disabled={isOptimizing}
                         className="text-xs font-black text-indigo-500 hover:text-indigo-600 flex items-center gap-1 disabled:opacity-50"
                       >
                         {isOptimizing ? t.optimizing : '✨ Optimize Route'}
                       </button>
                    </div>
                    
                    {smartRoute && (
                      <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-sm space-y-3 animate-in fade-in">
                        <p className="leading-relaxed whitespace-pre-wrap">{smartRoute.text}</p>
                        {smartRoute.links && smartRoute.links.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {smartRoute.links.map((link, i) => (
                              <a 
                                key={i} 
                                href={link.uri} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-white dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1"
                              >
                                📍 {link.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                 </div>
               </div>
             )}
          </div>

          <div className="space-y-4 min-h-[300px]">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xl font-black">{new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <button 
                onClick={() => {
                  setEditingEventId(null);
                  setEventForm({ title: '', description: '', time: '', period: 'morning', type: 'sightseeing', estimatedExpense: 0, currency: trip.defaultCurrency });
                  setShowEventModal(true);
                }}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform"
              >
                + {t.addEvent}
              </button>
            </div>

            {currentItinerary.length === 0 ? (
              <div className={`p-12 text-center rounded-[2.5rem] border-2 border-dashed ${darkMode ? 'border-zinc-800 text-zinc-600' : 'border-zinc-200 text-zinc-400'}`}>
                <p className="font-bold">No events planned for this day.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedEvents.morning.length > 0 && (
                  <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-100">
                    <div className="flex items-center gap-2 px-2">
                      <span className="text-xl">🌅</span>
                      <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.morning}</h4>
                    </div>
                    {groupedEvents.morning.map(renderEventCard)}
                  </div>
                )}
                {groupedEvents.afternoon.length > 0 && (
                  <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-200">
                    <div className="flex items-center gap-2 px-2">
                      <span className="text-xl">☀️</span>
                      <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.afternoon}</h4>
                    </div>
                    {groupedEvents.afternoon.map(renderEventCard)}
                  </div>
                )}
                {groupedEvents.night.length > 0 && (
                  <div className="space-y-4 animate-in slide-in-from-left-4 duration-500 delay-300">
                    <div className="flex items-center gap-2 px-2">
                      <span className="text-xl">🌙</span>
                      <h4 className="font-black uppercase tracking-widest text-sm opacity-60">{t.night}</h4>
                    </div>
                    {groupedEvents.night.map(renderEventCard)}
                  </div>
                )}
              </div>
            )}
            
            <div className="pt-4 flex justify-center">
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
                   href={getExternalMapsUrl(trip.location, currentItinerary)}
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
        </div>
      )}

      {/* Accommodation Tab */}
      {activeTab === 'accommodation' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           
           <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black">{t.accommodation}</h3>
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">Manage your stays</p>
              </div>
              <button 
                onClick={() => { setEditingHotelId(null); setHotelForm({}); setHotelUrlInput(''); setShowHotelModal(true); }}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform"
              >
                + {t.addHotel}
              </button>
           </div>

           {/* Saved Hotels List */}
           {trip.hotels && trip.hotels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {trip.hotels.map((hotel) => (
                  <div key={hotel.id} className={`p-6 rounded-[2.5rem] border group relative overflow-hidden transition-all hover:shadow-xl ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                         <h4 className="font-black text-xl leading-tight mb-1">{hotel.name}</h4>
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

      {/* Discovery Modal */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDiscoveryModal(false)} />
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">{t.discoverNearby}</h3>
             
             <div className="flex gap-2 mb-6">
                {(['eating', 'sightseeing', 'shopping'] as const).map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => handleDiscoverNearby(cat)}
                    disabled={isDiscovering}
                    className={`flex-1 py-3 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${isDiscovering ? 'opacity-50' : 'hover:scale-105 active:scale-95'} ${darkMode ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    {cat === 'eating' && '🍱 Food'}
                    {cat === 'sightseeing' && '🏛️ Sights'}
                    {cat === 'shopping' && '🛍️ Shop'}
                  </button>
                ))}
             </div>

             {isDiscovering ? (
               <div className="py-12 flex flex-col items-center justify-center text-indigo-500">
                 <div className="w-10 h-10 border-4 border-current border-t-transparent rounded-full animate-spin mb-4" />
                 <p className="font-black text-xs uppercase tracking-widest">{t.searching}</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {discoveryResults.map((place, i) => (
                   <div key={i} className={`p-4 rounded-2xl border flex justify-between items-center ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                      <div>
                        <div className="font-bold">{place.title}</div>
                        <div className="text-xs opacity-60 max-w-[200px] truncate">{place.description}</div>
                      </div>
                      <button 
                        onClick={() => handleAddDiscovery(place)}
                        className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                      </button>
                   </div>
                 ))}
                 {discoveryResults.length === 0 && (
                   <div className="text-center py-8 opacity-40 font-bold text-sm">Select a category to start exploring.</div>
                 )}
               </div>
             )}
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
                {editingFlightType === 'departure' ? 'Departure Flight' : editingFlightType === 'return' ? 'Return Flight' : 'Flight Details'}
             </h3>
             <div className="space-y-4">
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
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
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
                
                <div className="grid grid-cols-3 gap-3">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.time}</label>
                     <input 
                       type="time" 
                       value={eventForm.time || ''} 
                       onChange={e => setEventForm({...eventForm, time: e.target.value})} 
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                     />
                   </div>
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
    </div>
  );
};

export default TripDetail;
