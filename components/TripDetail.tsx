
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trip, Photo, Language, UserProfile, ItineraryItem, FlightInfo, Comment } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';
import { canLoadMap, recordMapLoad, getMapUrl } from '../services/mapsService';

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
  const [activeTab, setActiveTab] = useState<'itinerary' | 'album'>(trip.status === 'past' ? 'album' : 'itinerary');
  const [selectedDate, setSelectedDate] = useState<string>(trip.startDate);
  
  // Modals state
  const [showEventForm, setShowEventForm] = useState(false);
  const [showFlightForm, setShowFlightForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingFlightIndex, setEditingFlightIndex] = useState<number | null>(null);
  
  // Photo Viewing State
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null);
  
  // Photo & Comment state
  const [newComment, setNewComment] = useState('');
  const [newTag, setNewTag] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI & Optimization state
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [smartRouteResult, setSmartRouteResult] = useState<{ text: string, links: { uri: string, title: string }[] } | null>(null);
  const [loadingGuideId, setLoadingGuideId] = useState<string | null>(null);

  // Discovery State
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Weather State
  const [weatherData, setWeatherData] = useState<Record<string, { icon: string, temp: string, condition: string }>>({});
  const [loadingWeather, setLoadingWeather] = useState(false);

  // Map state
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapAllowed, setMapAllowed] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Form states
  const [timeMode, setTimeMode] = useState<'exact' | 'period'>('exact');
  const [eventForm, setEventForm] = useState<Partial<ItineraryItem>>({
    type: 'sightseeing',
    time: '09:00',
    endTime: '10:00',
    period: undefined,
    title: '',
    description: '',
    url: '',
    estimatedExpense: 0,
    actualExpense: 0,
    currency: trip.defaultCurrency || '',
    spendingDescription: '',
    transportMethod: '',
    travelDuration: ''
  });

  const [flightForm, setFlightForm] = useState<FlightInfo>({
    code: '',
    gate: '',
    airport: '',
    transport: ''
  });

  const tripDays = useMemo(() => {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const days = [];
    let curr = new Date(start);
    while (curr <= end) {
      days.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [trip.startDate, trip.endDate]);

  // Determine which flights to show for selected day
  const currentFlights = useMemo(() => {
    if (trip.flights && trip.flights[selectedDate]) {
      return trip.flights[selectedDate];
    }
    // Fallback for older data structure or specific start/end days
    if (selectedDate === trip.startDate && trip.departureFlight) {
      return [{ ...trip.departureFlight, label: t.departure }];
    }
    if (selectedDate === trip.endDate && trip.returnFlight) {
      return [{ ...trip.returnFlight, label: t.return }];
    }
    return [];
  }, [trip, selectedDate, t]);

  const currentDayEvents = useMemo(() => {
    const events = (trip.itinerary && trip.itinerary[selectedDate]) || [];
    
    const getSortTime = (item: ItineraryItem) => {
      if (item.time) return item.time;
      if (item.period === 'morning') return '07:00';
      if (item.period === 'afternoon') return '13:00';
      if (item.period === 'night') return '19:00';
      return '23:59';
    };

    return [...events].sort((a, b) => {
      const timeA = getSortTime(a);
      const timeB = getSortTime(b);
      return timeA.localeCompare(timeB);
    });
  }, [trip.itinerary, selectedDate]);

  // Derived state for the currently viewing photo
  const activePhoto = useMemo(() => {
    return trip.photos.find(p => p.id === viewingPhotoId) || null;
  }, [trip.photos, viewingPhotoId]);

  // Fetch Weather
  useEffect(() => {
    if (activeTab === 'itinerary' && Object.keys(weatherData).length === 0 && !loadingWeather) {
      const fetchWeather = async () => {
        setLoadingWeather(true);
        try {
          const data = await GeminiService.getWeatherForecast(trip.location, trip.startDate, trip.endDate);
          if (data) {
            setWeatherData(data);
          }
        } catch (e) {
          // Silent fail for weather
        }
        setLoadingWeather(false);
      };
      fetchWeather();
    }
  }, [activeTab, trip.location, trip.startDate, trip.endDate, weatherData, loadingWeather]);

  // Update Map when events change
  useEffect(() => {
    if (activeTab === 'itinerary' && currentDayEvents.length > 0) {
      if (canLoadMap()) {
        const url = getMapUrl(trip.location, currentDayEvents);
        setMapUrl(url);
        setMapAllowed(true);
      } else {
        setMapAllowed(false);
      }
    } else {
      setMapUrl(null);
    }
  }, [currentDayEvents, trip.location, activeTab]);

  const handleSmartRoute = async () => {
    if (currentDayEvents.length < 2) return;
    setIsOptimizing(true);
    try {
      const result = await GeminiService.getMapRoute(trip.location, currentDayEvents, language);
      setSmartRouteResult(result);
    } catch (e) {
      alert("AI Route optimization unavailable. Check your connection or region.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAiGuide = async (item: ItineraryItem) => {
    setLoadingGuideId(item.id);
    try {
      const guideData = await GeminiService.getTourGuideInfo(trip.location, item, language);
      if (guideData) {
        const updatedEvents = trip.itinerary[selectedDate].map(e => 
          e.id === item.id ? { ...e, guideInfo: guideData } : e
        );
        onUpdate({
          ...trip,
          itinerary: { ...trip.itinerary, [selectedDate]: updatedEvents }
        });
      } else {
        throw new Error("No data returned");
      }
    } catch (e) {
      alert("AI Guide unavailable. Please try again later.");
    } finally {
      setLoadingGuideId(null);
    }
  };

  const handleDiscover = async (query: string) => {
    if (!query.trim()) return;
    setIsDiscovering(true);
    setDiscoveryResults([]);
    try {
      const places = await GeminiService.discoverPlaces(trip.location, query, language);
      if (places && places.length > 0) {
        setDiscoveryResults(places);
      } else {
        // Soft error or empty state handled in UI
      }
    } catch (e) {
      console.error(e);
      alert("Discovery failed. AI features may be unavailable in your current region.");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddDiscoveryItem = (place: any) => {
    const newItem: ItineraryItem = {
      id: Date.now().toString(),
      title: place.title,
      description: place.description,
      type: place.type || 'sightseeing',
      estimatedExpense: place.estimatedExpense || 0,
      actualExpense: 0,
      currency: trip.defaultCurrency || '$',
      time: '12:00',
      endTime: '13:00'
    };
    setEventForm(newItem);
    setTimeMode('exact');
    setEditingEventId(null);
    setShowDiscovery(false);
    setShowEventForm(true);
  };

  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clean data based on mode
    const cleanedEventForm = { ...eventForm };
    if (timeMode === 'exact') {
      cleanedEventForm.period = undefined;
    } else {
      cleanedEventForm.time = undefined;
      cleanedEventForm.endTime = undefined;
    }

    // Separate ID from the rest of the form data to avoid duplicate assignment
    // when spreading back into ItineraryItem.
    // However, eventForm is Partial<ItineraryItem> which might contain 'id'.
    // We explicitly exclude 'id' from the spread.
    const { id: _, ...restForm } = cleanedEventForm as any;

    const newEvent: ItineraryItem = {
      id: editingEventId || Date.now().toString(),
      ...restForm
    };

    const currentEvents = trip.itinerary[selectedDate] || [];
    let updatedEvents;
    if (editingEventId) {
      updatedEvents = currentEvents.map(ev => ev.id === editingEventId ? newEvent : ev);
    } else {
      updatedEvents = [...currentEvents, newEvent];
    }

    onUpdate({
      ...trip,
      itinerary: { ...trip.itinerary, [selectedDate]: updatedEvents }
    });
    
    setShowEventForm(false);
    setEditingEventId(null);
    setEventForm({ type: 'sightseeing', estimatedExpense: 0, actualExpense: 0, currency: trip.defaultCurrency });
  };

  const deleteEvent = (id: string) => {
    const updatedEvents = (trip.itinerary[selectedDate] || []).filter(e => e.id !== id);
    onUpdate({ ...trip, itinerary: { ...trip.itinerary, [selectedDate]: updatedEvents } });
  };

  const handleFlightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newFlight = { ...flightForm };
    
    // Ensure flights object exists
    const allFlights = trip.flights || {};
    // Use current displayed flights to preserve edits to legacy data until save
    const currentDayFlights = [...currentFlights];

    if (editingFlightIndex !== null) {
      currentDayFlights[editingFlightIndex] = newFlight;
    } else {
      currentDayFlights.push(newFlight);
    }

    const updatedFlights = { ...allFlights, [selectedDate]: currentDayFlights };
    
    // Update legacy fields for compatibility if editing start/end dates
    let updates: Partial<Trip> = { flights: updatedFlights };
    if (selectedDate === trip.startDate) updates.departureFlight = currentDayFlights[0];
    if (selectedDate === trip.endDate) updates.returnFlight = currentDayFlights[0];

    onUpdate({ ...trip, ...updates });
    setShowFlightForm(false);
    setEditingFlightIndex(null);
    setFlightForm({ code: '', gate: '', airport: '', transport: '' });
  };

  const deleteFlight = (index: number) => {
    const allFlights = trip.flights || {};
    const currentDayFlights = [...currentFlights];
    currentDayFlights.splice(index, 1);
    
    let updates: Partial<Trip> = { 
      flights: { ...allFlights, [selectedDate]: currentDayFlights } 
    };
    
    if (selectedDate === trip.startDate) updates.departureFlight = currentDayFlights[0] || undefined;
    if (selectedDate === trip.endDate) updates.returnFlight = currentDayFlights[0] || undefined;
    
    onUpdate({ ...trip, ...updates });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const newPhoto: Photo = {
          id: Date.now().toString(),
          url: ev.target?.result as string,
          caption: 'New Memory',
          date: new Date().toISOString(),
          tags: [],
          comments: []
        };
        onUpdate({ ...trip, photos: [newPhoto, ...trip.photos] });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleUpdatePhoto = (id: string, updates: Partial<Photo>) => {
    const updatedPhotos = trip.photos.map(p => p.id === id ? { ...p, ...updates } : p);
    onUpdate({ ...trip, photos: updatedPhotos });
  };

  const handleDeletePhoto = (id: string) => {
    if (window.confirm("Are you sure you want to delete this photo?")) {
      const updatedPhotos = trip.photos.filter(p => p.id !== id);
      onUpdate({ ...trip, photos: updatedPhotos });
      setViewingPhotoId(null);
    }
  };

  return (
    <div className={`min-h-screen pb-20 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-20 z-30 py-4 bg-inherit backdrop-blur-md">
        <button onClick={onBack} className={`p-2 rounded-full ${darkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="text-center">
          <h2 className="text-xl font-black">{trip.title}</h2>
          <p className="text-xs font-bold opacity-50">{trip.startDate} - {trip.endDate}</p>
        </div>
        <button className={`p-2 rounded-full ${darkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-2.684 3 3 0 000 2.684zm0 12.684a3 3 0 100-2.684 3 3 0 000 2.684z"/></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className={`flex p-1 rounded-2xl mb-8 ${darkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
        <button onClick={() => setActiveTab('itinerary')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'itinerary' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500'}`}>{t.itinerary}</button>
        <button onClick={() => setActiveTab('album')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'album' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500'}`}>{t.album}</button>
      </div>

      {activeTab === 'itinerary' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
          
          {/* Date Selector */}
          <div className="overflow-x-auto no-scrollbar pb-2">
            <div className="flex gap-3">
              {tripDays.map((date) => {
                const d = new Date(date);
                const dayName = d.toLocaleDateString(language, { weekday: 'short' });
                const dayNum = d.getDate();
                const isSelected = selectedDate === date;
                const weather = weatherData[date];

                return (
                  <button 
                    key={date}
                    onClick={() => { setSelectedDate(date); setSmartRouteResult(null); }}
                    className={`flex flex-col items-center min-w-[70px] p-3 rounded-2xl border-2 transition-all ${isSelected ? 'border-indigo-500 bg-indigo-500/10' : (darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-100 bg-white')}`}
                  >
                    <span className={`text-[10px] font-black uppercase mb-1 ${isSelected ? 'text-indigo-500' : 'text-zinc-400'}`}>{dayName}</span>
                    <span className={`text-xl font-black ${isSelected ? (darkMode ? 'text-white' : 'text-zinc-900') : 'text-zinc-500'}`}>{dayNum}</span>
                    <span className="text-lg mt-1">{weather?.icon || '📅'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weather & Smart Route Card */}
          <div className={`p-5 rounded-3xl border-2 flex justify-between items-center ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
             <div className="flex items-center gap-4">
               <div className="text-3xl">{weatherData[selectedDate]?.icon || '🌤️'}</div>
               <div>
                 <p className="font-black text-sm">{weatherData[selectedDate]?.condition || 'Clear Sky'}</p>
                 <p className="text-xs font-bold opacity-50">{weatherData[selectedDate]?.temp || '20°C'}</p>
               </div>
             </div>
             <button 
                onClick={handleSmartRoute}
                disabled={isOptimizing || currentDayEvents.length < 2}
                className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
             >
               {isOptimizing ? t.optimizing : t.smartRoute}
             </button>
          </div>

          {/* Smart Route Result */}
          {smartRouteResult && (
            <div className={`p-6 rounded-3xl border-2 border-emerald-500/20 bg-emerald-500/5 animate-in fade-in`}>
              <h4 className="font-black text-emerald-500 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                {t.routeSuggestions}
              </h4>
              <p className="text-sm leading-relaxed opacity-80 mb-4">{smartRouteResult.text}</p>
              <div className="flex flex-wrap gap-2">
                {smartRouteResult.links.map((link, i) => (
                  <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                    {link.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Map Embed */}
          {mapAllowed && mapUrl && (
            <div className={`relative w-full rounded-[2.5rem] overflow-hidden shadow-lg border-2 transition-all duration-500 ease-in-out group ${darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-100 bg-zinc-100'}`} style={{ height: isMapExpanded ? '450px' : '180px' }}>
              <iframe
                title="Trip Map"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                src={mapUrl}
                onLoad={recordMapLoad}
                className="w-full h-full object-cover"
              ></iframe>
              <button 
                onClick={() => setIsMapExpanded(!isMapExpanded)}
                className="absolute bottom-4 right-4 bg-black text-white dark:bg-white dark:text-black px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest shadow-xl z-20 hover:scale-105 active:scale-95 transition-all"
              >
                {isMapExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          )}

          {/* Flights Section */}
          <div className="space-y-3">
            {currentFlights.map((flight, idx) => (
              <div key={idx} className={`relative p-5 rounded-3xl border-2 overflow-hidden group ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                {/* Background decoration */}
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                </div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500">
                      {flight.label || t.flightDetails}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => { setFlightForm(flight); setEditingFlightIndex(idx); setShowFlightForm(true); }} className={`p-2 rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      </button>
                      <button onClick={() => deleteFlight(idx)} className={`p-2 rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-rose-400' : 'bg-zinc-100 hover:bg-zinc-200 text-rose-500'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[9px] font-black uppercase text-zinc-400 block mb-1">{t.flightCode}</span>
                      <span className="text-xl font-black tracking-tight">{flight.code}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-zinc-400 block mb-1">{t.gate}</span>
                      <span className="text-xl font-black tracking-tight">{flight.gate || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] font-black uppercase text-zinc-400 block mb-1">{t.airport}</span>
                      <span className="font-bold text-sm block">{flight.airport}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t dark:border-zinc-800">
                      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        <span className="text-xs font-bold">{flight.transport}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => { setFlightForm({ code: '', gate: '', airport: '', transport: '' }); setEditingFlightIndex(null); setShowFlightForm(true); }}
              className={`w-full py-3 rounded-2xl border-2 border-dashed text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'border-zinc-800 text-zinc-500 hover:border-indigo-500 hover:text-indigo-500' : 'border-zinc-200 text-zinc-400 hover:border-indigo-400 hover:text-indigo-600'}`}
            >
              + {t.flightDetails}
            </button>
          </div>

          {/* Events List */}
          <div className="space-y-4">
            {currentDayEvents.length === 0 ? (
              <div className="text-center py-12 opacity-40">
                <p className="font-bold">No plans yet.</p>
              </div>
            ) : (
              currentDayEvents.map((item) => (
                <div key={item.id} className={`group relative p-5 rounded-3xl border-2 transition-all ${darkMode ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-100 hover:border-zinc-200 hover:shadow-lg'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1 min-w-[50px]">
                      {item.time ? (
                        <>
                          <span className="text-xs font-black opacity-50">{item.time}</span>
                          {item.endTime && <span className="text-[9px] font-black opacity-30">{item.endTime}</span>}
                        </>
                      ) : (
                        <span className="text-xs font-black opacity-50 uppercase">{item.period || 'ALL'}</span>
                      )}
                      
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mt-1 ${
                        item.type === 'eating' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 
                        item.type === 'transport' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 
                        item.type === 'shopping' ? 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' : 
                        'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                      }`}>
                        {item.type === 'eating' ? '🍱' : item.type === 'transport' ? '🚆' : item.type === 'shopping' ? '🛍️' : '🏛️'}
                      </div>
                    </div>
                    
                    <div className="flex-1 space-y-1">
                      <h4 className="font-black text-lg leading-tight">{item.title}</h4>
                      <p className="text-sm opacity-70 leading-relaxed">{item.description}</p>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.estimatedExpense > 0 && (
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {item.currency}{item.estimatedExpense}
                          </span>
                        )}
                        {item.transportMethod && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            {item.transportMethod}
                          </span>
                        )}
                      </div>

                      {/* AI Guide Section */}
                      {item.guideInfo ? (
                        <div className="mt-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                            <span className="text-lg">✨</span>
                            <span className="text-xs font-black uppercase tracking-widest">{t.aiGuide}</span>
                          </div>
                          <p className="text-sm italic opacity-90">"{item.guideInfo.story}"</p>
                          <div className="grid grid-cols-2 gap-2">
                            {item.guideInfo.mustEat?.length > 0 && (
                              <div className="bg-white dark:bg-zinc-800 p-2 rounded-xl">
                                <span className="text-[9px] font-black uppercase text-orange-500 block mb-1">{t.mustEat}</span>
                                <span className="text-xs font-bold block">{item.guideInfo.mustEat[0]}</span>
                              </div>
                            )}
                            {item.guideInfo.mustOrder?.length > 0 && (
                              <div className="bg-white dark:bg-zinc-800 p-2 rounded-xl">
                                <span className="text-[9px] font-black uppercase text-blue-500 block mb-1">{t.mustOrder}</span>
                                <span className="text-xs font-bold block">{item.guideInfo.mustOrder[0]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleAiGuide(item)}
                          disabled={loadingGuideId === item.id}
                          className="mt-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1 hover:underline disabled:opacity-50"
                        >
                          {loadingGuideId === item.id ? (
                            <><span className="animate-spin">⏳</span> {t.loadingGuide}</>
                          ) : (
                            <>✨ {t.aiGuide}</>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button onClick={() => { setEventForm(item); setEditingEventId(item.id); setTimeMode(item.time ? 'exact' : 'period'); setShowEventForm(true); }} className={`p-2 rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      </button>
                      <button onClick={() => deleteEvent(item.id)} className={`p-2 rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-rose-400' : 'bg-zinc-100 hover:bg-zinc-200 text-rose-500'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setEditingEventId(null); setEventForm({ type: 'sightseeing', estimatedExpense: 0, actualExpense: 0, currency: trip.defaultCurrency }); setTimeMode('exact'); setShowEventForm(true); }} className="w-full py-4 rounded-3xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 font-black uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-500 transition-all">
              {t.addEvent}
            </button>
            <button onClick={() => setShowDiscovery(true)} className="w-full py-4 rounded-3xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-500 font-black uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all">
              {t.discoverNearby}
            </button>
          </div>
        </div>
      )}

      {/* Flight Form Modal */}
      {showFlightForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFlightForm(false)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <h3 className="text-xl font-black mb-6">{editingFlightIndex !== null ? 'Update Flight' : 'Add Flight'}</h3>
            <form onSubmit={handleFlightSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.flightCode}</label>
                <input 
                  required
                  value={flightForm.code} 
                  onChange={e => setFlightForm({...flightForm, code: e.target.value})}
                  placeholder="e.g. JL820"
                  className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.gate}</label>
                <input 
                  value={flightForm.gate} 
                  onChange={e => setFlightForm({...flightForm, gate: e.target.value})}
                  placeholder="e.g. 62"
                  className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.airport}</label>
                <input 
                  value={flightForm.airport} 
                  onChange={e => setFlightForm({...flightForm, airport: e.target.value})}
                  placeholder="e.g. Narita Intl"
                  className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.transportPlan}</label>
                <input 
                  value={flightForm.transport} 
                  onChange={e => setFlightForm({...flightForm, transport: e.target.value})}
                  placeholder="e.g. Express Train"
                  className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                />
              </div>
              <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl mt-2">
                {t.confirmSelection}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Event Form Modal */}
      {showEventForm && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
           {/* Backdrop */}
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEventForm(false)} />
           
           {/* Modal Content */}
           <form 
             onSubmit={handleEventSubmit}
             className={`relative w-full max-w-md max-h-[90vh] flex flex-col rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-10 duration-300 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}
           >
              {/* Header (Title) */}
              <div className="px-8 pt-8 pb-4 flex-shrink-0">
                 <h3 className="text-2xl font-black">{editingEventId ? t.updateEvent : t.addEvent}</h3>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto px-8 py-2 space-y-6 custom-scrollbar pb-32">
                 
                 {/* Time Setting Toggle */}
                 <div className="space-y-3">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Time Setting</label>
                   <div className={`flex p-1 rounded-2xl ${darkMode ? 'bg-zinc-950' : 'bg-zinc-100'}`}>
                     <button 
                       type="button"
                       onClick={() => setTimeMode('exact')}
                       className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeMode === 'exact' ? (darkMode ? 'bg-zinc-800 text-white shadow-lg' : 'bg-white text-black shadow-lg') : 'text-zinc-500'}`}
                     >
                       ⏱️ {t.exactTime}
                     </button>
                     <button 
                       type="button"
                       onClick={() => setTimeMode('period')}
                       className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeMode === 'period' ? (darkMode ? 'bg-zinc-800 text-white shadow-lg' : 'bg-white text-black shadow-lg') : 'text-zinc-500'}`}
                     >
                       🕒 {t.period}
                     </button>
                   </div>
                 </div>

                 {/* Time Inputs */}
                 {timeMode === 'exact' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.startTime}</label>
                        <input 
                          type="time" 
                          value={eventForm.time || ''} 
                          onChange={e => setEventForm({...eventForm, time: e.target.value})}
                          className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.endTime}</label>
                        <input 
                          type="time" 
                          value={eventForm.endTime || ''} 
                          onChange={e => setEventForm({...eventForm, endTime: e.target.value})}
                          className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                        />
                      </div>
                    </div>
                 ) : (
                    <div className="flex gap-2">
                        {['morning', 'afternoon', 'night'].map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setEventForm({...eventForm, period: p as any})}
                                className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${eventForm.period === p ? 'border-indigo-500 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : (darkMode ? 'border-zinc-800 text-zinc-500 hover:border-zinc-700 bg-zinc-950' : 'border-zinc-200 text-zinc-400 hover:border-zinc-300 bg-zinc-50')}`}
                            >
                                {p === 'morning' ? t.morning : p === 'afternoon' ? t.afternoon : t.night}
                            </button>
                        ))}
                    </div>
                 )}

                 {/* Event Name */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.eventName}</label>
                    <input 
                      required
                      value={eventForm.title || ''}
                      onChange={e => setEventForm({...eventForm, title: e.target.value})}
                      placeholder="e.g. Visit Tokyo Tower"
                      className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                    />
                 </div>

                 {/* Category */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.category}</label>
                    <select 
                        value={eventForm.type} 
                        onChange={e => setEventForm({...eventForm, type: e.target.value as any})}
                        className={`w-full p-4 rounded-2xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                    >
                        <option value="sightseeing">{t.sightseeing}</option>
                        <option value="eating">{t.eating}</option>
                        <option value="shopping">{t.shopping}</option>
                        <option value="transport">{t.transport}</option>
                        <option value="other">{t.other}</option>
                    </select>
                 </div>

                 {/* Description */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.briefDescription}</label>
                    <textarea 
                      rows={3}
                      value={eventForm.description || ''}
                      onChange={e => setEventForm({...eventForm, description: e.target.value})}
                      className={`w-full p-4 rounded-2xl font-bold outline-none border-2 resize-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                    />
                 </div>

                 {/* How to get there */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.howToGetThere}</label>
                    <input 
                      value={eventForm.transportMethod || ''}
                      onChange={e => setEventForm({...eventForm, transportMethod: e.target.value})}
                      placeholder="e.g. Walk 5 mins / Bus 205"
                      className={`w-full p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                    />
                 </div>

                 {/* Estimated Cost */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated}</label>
                    <div className="flex gap-4">
                       <input 
                         type="number"
                         value={eventForm.estimatedExpense}
                         onChange={e => setEventForm({...eventForm, estimatedExpense: parseFloat(e.target.value) || 0})}
                         className={`flex-1 p-4 rounded-2xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                       />
                       <div className={`w-20 flex items-center justify-center rounded-2xl border-2 font-black ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                          {trip.defaultCurrency || '$'}
                       </div>
                    </div>
                 </div>
              </div>

              {/* Footer Button (Fixed) */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent dark:from-zinc-900 dark:via-zinc-900 z-10 rounded-b-[2.5rem]">
                 <button 
                   type="submit"
                   className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                 >
                   {t.confirmSelection}
                 </button>
              </div>
           </form>
        </div>
      )}

      {/* Discovery Modal */}
      {showDiscovery && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDiscovery(false)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <h3 className="text-xl font-black mb-4">{t.discoverNearby}</h3>
            {/* Search Input */}
            <div className="flex gap-2 mb-4">
              <input 
                autoFocus
                value={discoveryQuery}
                onChange={(e) => setDiscoveryQuery(e.target.value)}
                placeholder={t.searchPlaceholder || "Search..."}
                className={`flex-1 p-3 rounded-xl border-2 font-bold outline-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                onKeyDown={(e) => e.key === 'Enter' && handleDiscover(discoveryQuery)}
              />
              <button 
                onClick={() => handleDiscover(discoveryQuery)}
                disabled={isDiscovering}
                className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg disabled:opacity-50"
              >
                {isDiscovering ? <span className="animate-spin">⏳</span> : '🔍'}
              </button>
            </div>
            
            {/* Categories */}
            <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
              {[t.findFood, t.findSights, t.findShops].map((cat, i) => (
                 <button 
                   key={i} 
                   onClick={() => { setDiscoveryQuery(cat); handleDiscover(cat); }}
                   className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest whitespace-nowrap border ${darkMode ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-100'}`}
                 >
                   {cat}
                 </button>
              ))}
            </div>

            {/* Results */}
            <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">
              {discoveryResults.map((place, i) => (
                <div key={i} className={`p-3 rounded-xl border flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-zinc-100'}`}>
                  <div className="flex-1 mr-2">
                    <p className="font-bold text-sm">{place.title}</p>
                    <p className="text-[10px] opacity-60 line-clamp-1">{place.description}</p>
                  </div>
                  <button onClick={() => handleAddDiscoveryItem(place)} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                  </button>
                </div>
              ))}
              {discoveryResults.length === 0 && !isDiscovering && (
                <p className="text-center text-xs opacity-40 py-4">No results found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripDetail;
