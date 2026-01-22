
import React, { useState, useEffect, useRef } from 'react';
import { Trip, ItineraryItem, Photo, Language, UserProfile, FlightInfo, TourGuideData, Hotel } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';
import { GoogleService } from '../services/driveService';
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

const TripDetail: React.FC<TripDetailProps> = ({ trip, onUpdate, onEditPhoto, onBack, language, darkMode, userProfile }) => {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'itinerary' | 'photos' | 'info'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<string>(Object.keys(trip.itinerary).sort()[0] || '');
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
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

  // Hotel Recommendation State
  const [hotelPreferences, setHotelPreferences] = useState('');
  const [isSearchingHotels, setIsSearchingHotels] = useState(false);

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

  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!selectedDate && Object.keys(trip.itinerary).length > 0) {
       setSelectedDate(Object.keys(trip.itinerary).sort()[0]);
    }
  }, [trip.itinerary]);

  // Fetch Weather once on mount if dates are valid
  useEffect(() => {
    if (trip.startDate && trip.endDate && !weather) {
      GeminiService.getWeatherForecast(trip.location, trip.startDate, trip.endDate)
        .then(res => setWeather(res))
        .catch(console.error);
    }
  }, [trip.id]);

  const handleTimeChange = (newTime: string) => {
    setEventForm(prev => {
      const updates: any = { time: newTime };
      // Auto-suggest period if user sets a specific time, but allow override
      if (newTime) {
         const hour = parseInt(newTime.split(':')[0], 10);
         if (hour < 12) updates.period = 'morning';
         else if (hour < 18) updates.period = 'afternoon';
         else updates.period = 'night';
      }
      return { ...prev, ...updates };
    });
  };

  const handleSaveEvent = () => {
    if (!selectedDate || !eventForm.title) return;

    // Use selected period. If explicitly set, respect it.
    // If no period set, try to derive from time. Default to morning.
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
      description: eventForm.description || '',
      time: eventForm.time, // Can be empty string
      period: finalPeriod as 'morning' | 'afternoon' | 'night',
      type: eventForm.type || 'sightseeing',
      estimatedExpense: eventForm.estimatedExpense || 0,
      actualExpense: 0,
      currency: trip.defaultCurrency,
      transportMethod: eventForm.transportMethod,
      url: eventForm.url,
      // preserve existing expense parts if editing
      expenseParts: (editingEventId && trip.itinerary[selectedDate]?.find(i => i.id === editingEventId)?.expenseParts) || []
    };

    const currentItems = trip.itinerary[selectedDate] || [];
    let newItems;
    
    if (editingEventId) {
      newItems = currentItems.map(item => item.id === editingEventId ? { ...item, ...newItem } : item);
    } else {
      newItems = [...currentItems, newItem];
    }
    
    // Sort by period rank then time
    // Flexible events (no time) appear first within their period block
    const periodRank = { morning: 0, afternoon: 1, night: 2 };
    newItems.sort((a, b) => {
      const rankA = periodRank[a.period || 'morning'];
      const rankB = periodRank[b.period || 'morning'];
      if (rankA !== rankB) return rankA - rankB;
      // If same period, sort by time string (empty strings first)
      return (a.time || '').localeCompare(b.time || '');
    });

    onUpdate({
      ...trip,
      itinerary: {
        ...trip.itinerary,
        [selectedDate]: newItems
      }
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
      itinerary: {
        ...trip.itinerary,
        [selectedDate]: newItems
      }
    });
    if (selectedDiscoveryId === eventId) setSelectedDiscoveryId(null);
  };

  const handleEditEvent = (item: ItineraryItem) => {
    setEditingEventId(item.id);
    setEventForm({ ...item, period: item.period || 'morning' }); // Ensure period is set
    setShowEventModal(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const newPhoto: Photo = {
            id: Date.now().toString(),
            url: ev.target.result as string,
            caption: 'New Memory',
            date: new Date().toISOString(),
            tags: [],
            type: 'image'
          };
          onUpdate({ ...trip, photos: [newPhoto, ...trip.photos] });
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const openAiLogistics = async () => {
    if (!eventForm.title) return;
    setAiLoading(true);
    try {
      // Find previous event for logistics context
      const currentItems = trip.itinerary[selectedDate] || [];
      const prevItem = currentItems.length > 0 ? currentItems[currentItems.length - 1].title : null;

      const logistics = await GeminiService.getEventLogistics(trip.location, eventForm as ItineraryItem, prevItem, language);
      if (logistics) {
        setEventForm(prev => ({
          ...prev,
          estimatedExpense: logistics.price !== undefined ? logistics.price : prev.estimatedExpense,
          transportMethod: logistics.transportShort || prev.transportMethod,
          description: (prev.description ? prev.description + '\n\n' : '') + `📍 Logistics: ${logistics.details || ''}`
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSmartRoute = async () => {
    setIsOptimizing(true);
    setSmartRoute(null);
    try {
      const result = await GeminiService.getMapRoute(trip.location, trip.itinerary[selectedDate] || [], language);
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
      time: '', // User to set time
      period: 'afternoon'
    };
    
    const currentItems = trip.itinerary[selectedDate] || [];
    const newItems = [...currentItems, newItem];
    // Sort logic handled in next update or render
    onUpdate({
      ...trip,
      itinerary: {
        ...trip.itinerary,
        [selectedDate]: newItems
      }
    });
    setShowDiscoveryModal(false);
  };

  const handleFindHotels = async () => {
    setIsSearchingHotels(true);
    try {
      const allItems = Object.values(trip.itinerary).flat();
      const hotels = await GeminiService.recommendHotels(
        trip.location, 
        allItems, 
        hotelPreferences, 
        language
      );
      onUpdate({ ...trip, hotels });
    } catch (e) {
      console.error("Hotel search failed", e);
      alert("Could not find hotels. Please try again.");
    } finally {
      setIsSearchingHotels(false);
    }
  };

  // --- Flight Handlers ---
  const handleOpenFlightModal = (type: 'departure' | 'return' | 'complex', date?: string, index?: number) => {
    setEditingFlightType(type);
    if (type === 'complex' && date !== undefined && index !== undefined) {
      setEditingComplexDate(date);
      setEditingComplexIndex(index);
      const flightsOnDate = trip.flights?.[date] || [];
      const f = flightsOnDate[index];
      setFlightForm(f || { code: '', gate: '', airport: '', transport: '' });
    } else {
      const existing = type === 'departure' ? trip.departureFlight : trip.returnFlight;
      setFlightForm(existing || { code: '', gate: '', airport: '', transport: '' });
    }
    setShowFlightModal(true);
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

  const handleDeleteFlight = (type: 'departure' | 'return' | 'complex', date?: string, index?: number) => {
    if (window.confirm("Are you sure you want to delete this flight details?")) {
      const updatedTrip = { ...trip };
      
      if (type === 'departure') {
        delete updatedTrip.departureFlight;
      } else if (type === 'return') {
        delete updatedTrip.returnFlight;
      } else if (type === 'complex' && date && index !== undefined) {
        const flights = { ...(updatedTrip.flights || {}) };
        const list = [...(flights[date] || [])];
        list.splice(index, 1);
        if (list.length === 0) {
          delete flights[date];
        } else {
          flights[date] = list;
        }
        updatedTrip.flights = flights;
      }
      
      onUpdate(updatedTrip);
    }
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
        <div className="absolute bottom-8 left-8 right-8 text-white">
          <h1 className="text-4xl font-black mb-2 tracking-tight">{trip.title}</h1>
          <div className="flex items-center gap-4 text-sm font-bold opacity-90">
            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg">📍 {trip.location}</span>
            <span>📅 {trip.startDate} - {trip.endDate}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {(['itinerary', 'photos', 'info'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab 
              ? 'bg-indigo-600 text-white shadow-lg scale-105' 
              : (darkMode ? 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800' : 'bg-white text-zinc-400 hover:bg-zinc-50')}`}
          >
            {tab === 'itinerary' && t.itinerary}
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
                className={`flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border-2 ${selectedDate === date 
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xl scale-110' 
                  : (darkMode ? 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700' : 'border-zinc-100 bg-white text-zinc-400 hover:border-zinc-200')}`}
              >
                <span className="text-[10px] font-black uppercase">Day</span>
                <span className="text-xl font-black">{index + 1}</span>
                {weather && weather[date] && (
                  <span className="text-xs">{weather[date].icon}</span>
                )}
              </button>
            ))}
          </div>

          {/* Map & Weather Section - Collapsible */}
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

          {/* Hotel Recommendation Section */}
          <div className="pt-12 border-t border-zinc-100 dark:border-zinc-800">
             <div className="flex flex-col gap-4">
               <div className="flex items-center justify-between">
                 <div>
                   <h3 className="text-2xl font-black">{t.hotels}</h3>
                   <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t.recommendedHotels}</p>
                 </div>
                 {trip.hotels && trip.hotels.length > 0 && (
                   <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                     {trip.hotels.length} Found
                   </span>
                 )}
               </div>

               <div className={`p-6 rounded-[2.5rem] border-2 space-y-4 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                  <div className="flex flex-col md:flex-row gap-4 items-stretch">
                     <div className="flex-1">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1 mb-2 block">{t.hotelPreferences}</label>
                        <div className="relative">
                          <input 
                            value={hotelPreferences}
                            onChange={(e) => setHotelPreferences(e.target.value)}
                            placeholder={t.hotelPlaceholder}
                            className={`w-full p-4 rounded-2xl font-bold outline-none border-2 transition-all ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500'}`}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                          </div>
                        </div>
                     </div>
                     <button 
                       onClick={handleFindHotels}
                       disabled={isSearchingHotels}
                       className="self-end px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                     >
                       {isSearchingHotels ? (
                         <>
                           <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           {t.analyzingPlan}
                         </>
                       ) : (
                         <>
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                           {t.findHotels}
                         </>
                       )}
                     </button>
                  </div>

                  {trip.hotels && trip.hotels.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 animate-in fade-in slide-in-from-bottom-4">
                       {trip.hotels.map((hotel) => (
                         <div key={hotel.id} className={`p-5 rounded-2xl border flex flex-col gap-3 group relative overflow-hidden ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                            <div className="flex justify-between items-start">
                               <div>
                                  <h4 className="font-black text-lg leading-tight">{hotel.name}</h4>
                                  <div className="flex items-center gap-1 mt-1">
                                     <span className="text-yellow-500 text-xs">★</span>
                                     <span className="text-xs font-bold">{hotel.rating}</span>
                                     <span className="text-[10px] opacity-50 px-2">•</span>
                                     <span className="text-xs opacity-60 font-bold">{hotel.price}</span>
                                  </div>
                               </div>
                               <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                                  <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                               </div>
                            </div>
                            
                            <p className="text-sm opacity-70 leading-relaxed italic border-l-2 border-indigo-500 pl-3">
                               "{hotel.reason}"
                            </p>

                            <div className="flex flex-wrap gap-2 mt-auto pt-2">
                               {hotel.amenities.map(tag => (
                                 <span key={tag} className="px-2 py-1 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold uppercase tracking-wider opacity-70">
                                   {tag}
                                 </span>
                               ))}
                            </div>

                            <a 
                              href={hotel.bookingUrl || `https://www.google.com/travel/hotels?q=${encodeURIComponent(hotel.name + ' ' + trip.location)}`}
                              target="_blank" 
                              rel="noreferrer"
                              className="mt-3 w-full py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase tracking-widest text-center hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                              {t.bookNow}
                            </a>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Photos View */}
      {activeTab === 'photos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <label className={`aspect-square rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${darkMode ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-200 hover:bg-zinc-50'}`}>
              <svg className="w-8 h-8 opacity-50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.importMedia}</span>
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
            </label>
            {trip.photos.map(photo => (
              <div key={photo.id} onClick={() => onEditPhoto(photo)} className="group relative aspect-square rounded-[2rem] overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all">
                <img src={photo.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={photo.caption} />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white/20 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold">Edit</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Info View */}
      {activeTab === 'info' && (
        <div className="space-y-6">
           <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
              <h3 className="text-xl font-black mb-4">Trip Details</h3>
              <p className="opacity-70 leading-relaxed">{trip.description}</p>
              
              {/* RESTORED & EDITABLE: Simple Flight Details (Departure/Return) */}
              {(!trip.flights || Object.keys(trip.flights).length === 0) && (
                <div className="mt-8 space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                           <h4 className="font-bold uppercase text-xs tracking-widest opacity-50">{t.departure}</h4>
                           {!trip.departureFlight && (
                             <button onClick={() => handleOpenFlightModal('departure')} className="text-[10px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-widest">+ Add Departure</button>
                           )}
                        </div>
                        {trip.departureFlight && (
                            <div className={`group p-3 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-black truncate">{trip.departureFlight.code}</div>
                                    <div className="text-xs opacity-60 truncate">{trip.departureFlight.airport}</div>
                                </div>
                                <div className="text-right flex-1 min-w-0">
                                    <div className="text-xs font-bold truncate">{trip.departureFlight.gate ? `Gate ${trip.departureFlight.gate}` : ''}</div>
                                    <div className="text-[10px] opacity-60 truncate">{trip.departureFlight.transport}</div>
                                </div>
                                <div className="flex gap-1 shrink-0 ml-2">
                                   <button onClick={() => handleOpenFlightModal('departure')} className="p-1.5 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 rounded-lg shadow hover:bg-indigo-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                   <button onClick={() => handleDeleteFlight('departure')} className="p-1.5 bg-white dark:bg-zinc-800 text-rose-500 rounded-lg shadow hover:bg-rose-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                           <h4 className="font-bold uppercase text-xs tracking-widest opacity-50">{t.return}</h4>
                           {!trip.returnFlight && (
                             <button onClick={() => handleOpenFlightModal('return')} className="text-[10px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-widest">+ Add Return</button>
                           )}
                        </div>
                        {trip.returnFlight && (
                            <div className={`group p-3 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-black truncate">{trip.returnFlight.code}</div>
                                    <div className="text-xs opacity-60 truncate">{trip.returnFlight.airport}</div>
                                </div>
                                <div className="text-right flex-1 min-w-0">
                                    <div className="text-xs font-bold truncate">{trip.returnFlight.gate ? `Gate ${trip.returnFlight.gate}` : ''}</div>
                                    <div className="text-[10px] opacity-60 truncate">{trip.returnFlight.transport}</div>
                                </div>
                                <div className="flex gap-1 shrink-0 ml-2">
                                   <button onClick={() => handleOpenFlightModal('return')} className="p-1.5 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 rounded-lg shadow hover:bg-indigo-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                   <button onClick={() => handleDeleteFlight('return')} className="p-1.5 bg-white dark:bg-zinc-800 text-rose-500 rounded-lg shadow hover:bg-rose-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
              )}

              {/* Complex Flight Itinerary (Multi-leg) - Now Editable */}
              {trip.flights && Object.keys(trip.flights).length > 0 && (
                <div className="mt-8 space-y-4">
                  <h4 className="font-bold uppercase text-xs tracking-widest opacity-50">{t.flightDetails}</h4>
                  {Object.entries(trip.flights).map(([date, flights]) => (
                     <div key={date} className="space-y-2">
                        <div className="text-xs font-black opacity-60">{date}</div>
                        {(flights as FlightInfo[]).map((f, i) => (
                           <div key={i} className={`group p-3 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                              <div className="flex-1 min-w-0">
                                 <div className="font-black truncate">{f.code}</div>
                                 <div className="text-xs opacity-60 truncate">{f.airport}</div>
                              </div>
                              <div className="text-right flex-1 min-w-0">
                                 <div className="text-xs font-bold truncate">{f.gate ? `Gate ${f.gate}` : ''}</div>
                                 <div className="text-[10px] opacity-60 truncate">{f.transport}</div>
                              </div>
                              <div className="flex gap-1 shrink-0 ml-2">
                                 <button onClick={() => handleOpenFlightModal('complex', date, i)} className="p-1.5 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 rounded-lg shadow hover:bg-indigo-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                 <button onClick={() => handleDeleteFlight('complex', date, i)} className="p-1.5 bg-white dark:bg-zinc-800 text-rose-500 rounded-lg shadow hover:bg-rose-50 dark:hover:bg-zinc-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </div>
                           </div>
                        ))}
                     </div>
                  ))}
                </div>
              )}
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

      {/* Flight Modal */}
      {showFlightModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFlightModal(false)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">{editingFlightType === 'departure' ? t.departure : (editingFlightType === 'return' ? t.return : t.flightDetails)}</h3>
             <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.flightCode}</label>
                   <input 
                     value={flightForm.code} 
                     onChange={e => setFlightForm({...flightForm, code: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.airport}</label>
                   <input 
                     value={flightForm.airport} 
                     onChange={e => setFlightForm({...flightForm, airport: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.gate}</label>
                   <input 
                     value={flightForm.gate} 
                     onChange={e => setFlightForm({...flightForm, gate: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.transport}</label>
                   <input 
                     value={flightForm.transport} 
                     onChange={e => setFlightForm({...flightForm, transport: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="pt-4 flex gap-3">
                   <button onClick={() => setShowFlightModal(false)} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800">{t.cancel}</button>
                   <button onClick={handleSaveFlight} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-indigo-600 text-white shadow-lg">{t.save}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEventModal(false)} />
          <div className={`relative w-full max-w-lg p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-2xl font-black">{editingEventId ? t.updateEvent : t.addEvent}</h3>
               <button onClick={openAiLogistics} disabled={aiLoading || !eventForm.title} className="text-xs font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 flex items-center gap-1 disabled:opacity-50">
                 {aiLoading ? <span className="animate-pulse">Thinking...</span> : '✨ Auto-Fill Logistics'}
               </button>
             </div>

             <div className="space-y-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.eventName}</label>
                   <input 
                     placeholder="e.g. Visit Louvre Museum"
                     value={eventForm.title}
                     onChange={e => setEventForm({...eventForm, title: e.target.value})}
                     className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Period Selector */}
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.period || 'Period'}</label>
                     <select 
                       value={eventForm.period}
                       onChange={e => setEventForm({...eventForm, period: e.target.value as any})}
                       className={`w-full p-4 rounded-2xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500'}`}
                     >
                       <option value="morning">{t.morning}</option>
                       <option value="afternoon">{t.afternoon}</option>
                       <option value="night">{t.night}</option>
                     </select>
                  </div>

                  {/* Exact Time (Optional) */}
                  <div className="space-y-2 relative">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.exactTime} (Optional)</label>
                     <div className="relative">
                       <input 
                         type="time"
                         value={eventForm.time}
                         onChange={e => handleTimeChange(e.target.value)}
                         className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500'}`}
                       />
                       {eventForm.time && (
                         <button 
                           onClick={() => setEventForm({...eventForm, time: ''})}
                           className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-zinc-400 hover:text-rose-500 transition-colors"
                           title="Clear specific time"
                         >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                         </button>
                       )}
                     </div>
                  </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.category}</label>
                   <select 
                     value={eventForm.type}
                     onChange={e => setEventForm({...eventForm, type: e.target.value as any})}
                     className={`w-full p-4 rounded-2xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   >
                     <option value="sightseeing">🏛️ Sightseeing</option>
                     <option value="eating">🍱 Eating</option>
                     <option value="shopping">🛍️ Shopping</option>
                     <option value="transport">🚗 Transport</option>
                     <option value="other">✨ Other</option>
                   </select>
                </div>
                
                 {/* Estimated Cost */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated}</label>
                    <div className="flex gap-4">
                       <input 
                         type="number"
                         placeholder="0"
                         value={eventForm.estimatedExpense === 0 ? '' : eventForm.estimatedExpense}
                         onChange={e => setEventForm({...eventForm, estimatedExpense: parseFloat(e.target.value) || 0})}
                         className={`flex-1 p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                       />
                       <div className={`w-20 flex items-center justify-center rounded-2xl border-2 font-black ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                          {trip.defaultCurrency || '$'}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.briefDescription}</label>
                   <textarea 
                     rows={3}
                     placeholder="Notes about this event..."
                     value={eventForm.description}
                     onChange={e => setEventForm({...eventForm, description: e.target.value})}
                     className={`w-full p-4 rounded-2xl font-medium outline-none border-2 resize-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
             </div>

             <div className="mt-8 flex gap-3">
               <button onClick={() => setShowEventModal(false)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-xs tracking-widest ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                 {t.cancel}
               </button>
               <button onClick={handleSaveEvent} className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest shadow-xl">
                 {t.save}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripDetail;
