
import React, { useState, useEffect } from 'react';
import { Trip, ViewState, Photo, Language, UserProfile, CustomEvent, ItineraryItem, FlightInfo, FontSize, Comment } from '@/types';
import Header from '@/components/Header';
import Dashboard from '@/components/Dashboard';
import TripDetail from '@/components/TripDetail';
import Planner from '@/components/Planner';
import Calendar from '@/components/Calendar';
import Budget from '@/components/Budget';
import ImageEditor from '@/components/ImageEditor';
import Settings from '@/components/Settings';
import Onboarding from '@/components/Onboarding';
import UserGuide from '@/components/UserGuide';
import { translations } from '@/translations';
import { getInitialTrips } from '@/data/initialTrips';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Wanderer',
  pfp: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Wanderer',
  nationality: 'United States',
  isOnboarded: false
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('wanderlust_lang') as Language) || 'en';
  });

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    return (localStorage.getItem('wanderlust_font_size') as FontSize) || 'medium';
  });

  // Data Timestamp Tracking for Sync
  const [dataTimestamp, setDataTimestamp] = useState<number>(() => {
    return parseInt(localStorage.getItem('wanderlust_data_ts') || '0', 10);
  });

  const [trips, setTrips] = useState<Trip[]>(() => {
    const saved = localStorage.getItem('wanderlust_trips');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return getInitialTrips(language);
      }
    }
    return getInitialTrips(language);
  });
  
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('wanderlust_profile');
    return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
  });

  const [customEvents, setCustomEvents] = useState<CustomEvent[]>(() => {
    const saved = localStorage.getItem('wanderlust_events');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<ViewState>(() => {
    const savedProfile = localStorage.getItem('wanderlust_profile');
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      return parsed.isOnboarded ? 'dashboard' : 'onboarding';
    }
    return 'onboarding';
  });

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<{ tripId: string, photo: Photo } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('wanderlust_dark') === 'true';
  });

  // API Key Selection State
  const [isKeySelected, setIsKeySelected] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      // 1. If key is in environment, use it and bypass selection
      if (process.env.API_KEY && process.env.API_KEY !== 'PASTE_YOUR_KEY_HERE') {
        setIsKeySelected(true);
        setCheckingKey(false);
        return;
      }

      // 2. If in AI Studio/IDX environment, check for selected key
      if (window.aistudio) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setIsKeySelected(hasKey);
        } catch (e) {
          console.error("Failed to check API key state", e);
          setIsKeySelected(false);
        }
      } else {
        // 3. Not in AI Studio and no env key? Assume standard deployment might inject it later or allow pass through
        // but generally we mark as selected to avoid blocking UI if we can't do anything about it.
        setIsKeySelected(true);
      }
      setCheckingKey(false);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success to mitigate race condition
        setIsKeySelected(true);
      } catch (e) {
        console.error("Failed to open key selection", e);
        // If "Requested entity was not found" error, reset state
        setIsKeySelected(false);
      }
    }
  };

  // Updates timestamp whenever critical data changes
  const updateDataTimestamp = () => {
    const ts = Date.now();
    setDataTimestamp(ts);
    localStorage.setItem('wanderlust_data_ts', ts.toString());
  };

  // Wrapper for updating state to ensure timestamp update
  const handleSetTrips = (newTrips: Trip[]) => {
    setTrips(newTrips);
    updateDataTimestamp();
  };
  const handleSetUserProfile = (p: UserProfile) => {
    setUserProfile(p);
    updateDataTimestamp();
  };
  const handleSetCustomEvents = (e: CustomEvent[]) => {
    setCustomEvents(e);
    updateDataTimestamp();
  };

  // Effect to apply font size
  useEffect(() => {
    localStorage.setItem('wanderlust_font_size', fontSize);
    const root = document.documentElement;
    if (fontSize === 'small') {
      root.style.fontSize = '14px';
    } else if (fontSize === 'medium') {
      root.style.fontSize = '16px';
    } else if (fontSize === 'large') {
      root.style.fontSize = '18px';
    }
  }, [fontSize]);

  // Effect to update example trips when language changes
  useEffect(() => {
    const initialTrips = getInitialTrips(language);
    
    setTrips(prev => prev.map((t: Trip) => {
      // Find if this current trip is one of the initial trips (e.g. ID '1' or '2')
      const localizedVersion = initialTrips.find(it => it.id === t.id);
      
      if (localizedVersion) {
        // Build localized itinerary while preserving user edits might be complex, 
        // but for "Example" trips, we assume structure matches.
        const localizedItinerary: Record<string, ItineraryItem[]> = {};
        
        Object.keys(t.itinerary).forEach(date => {
           const currentItems = t.itinerary[date];
           const exampleItems = localizedVersion.itinerary[date] || [];
           
           localizedItinerary[date] = currentItems.map((item: ItineraryItem) => {
             // Try to find matching item in localized version by ID
             const exampleItem = exampleItems.find((ei: ItineraryItem) => ei.id === item.id);
             
             if (exampleItem) {
               // Update localized fields but keep user-specific fields if they deviate?
               // For simplicity in this demo app, we overwrite text fields to ensure translation works.
               return { 
                 ...item, 
                 title: exampleItem.title, 
                 description: exampleItem.description, 
                 transportMethod: exampleItem.transportMethod, 
                 travelDuration: exampleItem.travelDuration 
               };
             }
             return item;
           });
        });

        // Localize Photos captions
        const localizedPhotos = t.photos.map((p: Photo) => {
          const examplePhoto = localizedVersion.photos.find((ep: Photo) => ep.id === p.id);
          return examplePhoto ? { ...p, caption: examplePhoto.caption } : p;
        });

        // Localize Flights
        const localizedFlightDep = localizedVersion.departureFlight;
        const localizedFlightRet = localizedVersion.returnFlight;

        return {
          ...t,
          title: localizedVersion.title,
          description: localizedVersion.description,
          location: localizedVersion.location,
          itinerary: localizedItinerary,
          photos: localizedPhotos,
          departureFlight: localizedFlightDep ? { ...t.departureFlight!, ...localizedFlightDep } : t.departureFlight,
          returnFlight: localizedFlightRet ? { ...t.returnFlight!, ...localizedFlightRet } : t.returnFlight,
          comments: t.comments.map((c: Comment) => {
             const exampleComment = localizedVersion.comments.find((ec: Comment) => ec.id === c.id);
             return exampleComment ? { ...c, text: exampleComment.text } : c;
          })
        };
      }
      return t;
    }));
  }, [language]);

  useEffect(() => {
    localStorage.setItem('wanderlust_trips', JSON.stringify(trips));
    localStorage.setItem('wanderlust_profile', JSON.stringify(userProfile));
    localStorage.setItem('wanderlust_events', JSON.stringify(customEvents));
    localStorage.setItem('wanderlust_lang', language);
    localStorage.setItem('wanderlust_dark', darkMode.toString());
    
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [trips, userProfile, customEvents, language, darkMode]);

  const activeTrip = trips.find(t => t.id === activeTripId) || null;
  const t = translations[language];

  // Fix: Use functional updates to prevent stale state issues
  const handleUpdateTrip = (updatedTrip: Trip) => {
    setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
    updateDataTimestamp();
  };

  const handleDeleteTrip = (id: string) => {
    // If we are deleting the currently active trip, clear it first to avoid errors
    if (activeTripId === id) {
      setActiveTripId(null);
    }
    setTrips(prev => prev.filter(t => t.id !== id));
    updateDataTimestamp();
  };

  const handleImportData = (data: any) => {
    if (data.trips) setTrips(data.trips);
    if (data.userProfile) setUserProfile(data.userProfile);
    if (data.customEvents) setCustomEvents(data.customEvents);
    updateDataTimestamp();
  };

  const handleCombineTrips = (selectedTripIds: string[]) => {
    if (selectedTripIds.length < 2) return;
    const selectedTrips = trips.filter(t => selectedTripIds.includes(t.id)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    const flightsMap: Record<string, FlightInfo[]> = {};

    selectedTrips.forEach((trip, index) => {
      if (trip.flights && Object.keys(trip.flights).length > 0) {
        Object.entries(trip.flights).forEach(([date, list]) => {
          if (!flightsMap[date]) flightsMap[date] = [];
          flightsMap[date].push(...(list as FlightInfo[]));
        });
      } else {
        const startKey = trip.startDate;
        if (!flightsMap[startKey]) flightsMap[startKey] = [];
        
        const depLabel = index === 0 ? 'Departure' : `Leg ${index + 1} Start`;
        const depInfo = trip.departureFlight || { code: '', gate: '', airport: '', transport: '' };
        flightsMap[startKey].push({ ...depInfo, label: depLabel });

        const endKey = trip.endDate;
        if (!flightsMap[endKey]) flightsMap[endKey] = [];
        
        const retLabel = index === selectedTrips.length - 1 ? 'Return' : `Leg ${index + 1} End`;
        const retInfo = trip.returnFlight || { code: '', gate: '', airport: '', transport: '' };
        flightsMap[endKey].push({ ...retInfo, label: retLabel });
      }
    });

    const combinedTrip: Trip = {
      id: `combined-${Date.now()}`,
      title: `Multi-Country: ${selectedTrips.map(t => t.title).join(' & ')}`,
      location: selectedTrips.map(t => t.location).join(', '),
      startDate: selectedTrips[0].startDate,
      endDate: selectedTrips[selectedTrips.length - 1].endDate,
      description: `Combined journey covering ${selectedTrips.length} regions.`,
      status: 'future',
      coverImage: selectedTrips[0].coverImage,
      photos: [],
      comments: [],
      rating: 0,
      dayRatings: {},
      favoriteDays: [],
      budget: selectedTrips.reduce((sum, t) => sum + (t.budget || 0), 0),
      itinerary: selectedTrips.reduce((acc, t) => ({ ...acc, ...t.itinerary }), {}),
      flights: flightsMap,
      departureFlight: selectedTrips[0].departureFlight,
      returnFlight: selectedTrips[selectedTrips.length - 1].returnFlight
    };

    handleSetTrips([...trips.filter(t => !selectedTripIds.includes(t.id)), combinedTrip]);
    setActiveTripId(combinedTrip.id);
    setView('trip-detail');
  };

  const openTrip = (id: string) => {
    setActiveTripId(id);
    setView('trip-detail');
  };

  if (checkingKey) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-zinc-950' : 'bg-white'}`}>
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isKeySelected) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 animate-in fade-in duration-500 ${darkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>
        <div className="max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center bg-indigo-600 shadow-xl mb-8">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Unlock AI Features</h1>
          <p className="text-zinc-500 font-bold leading-relaxed">
            To use the advanced AI travel planning and photo enhancement features, please select a Google Cloud API key.
          </p>
          <div className="space-y-4 pt-4">
            <button 
              onClick={handleSelectKey} 
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-[0.98]"
            >
              Select API Key
            </button>
            <p className="text-xs text-zinc-400">
              Billing must be enabled on your Google Cloud Project. 
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-indigo-500 ml-1">Learn more</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <Onboarding 
        userProfile={userProfile}
        setUserProfile={handleSetUserProfile}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        language={language}
        onComplete={() => {
          handleSetUserProfile({ ...userProfile, isOnboarded: true });
          setView('dashboard');
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen pb-24 transition-colors duration-300 ${darkMode ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
      <Header setView={setView} currentView={view} language={language} darkMode={darkMode} userProfile={userProfile} onShowGuide={() => setShowGuide(true)} />
      
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-12">
        {view === 'dashboard' && <Dashboard trips={trips.filter(t => t.status === 'past')} onOpenTrip={openTrip} onUpdateTrip={handleUpdateTrip} onDeleteTrip={handleDeleteTrip} language={language} darkMode={darkMode} />}
        {view === 'trip-detail' && activeTrip && <TripDetail key={activeTrip.id} trip={activeTrip} onUpdate={handleUpdateTrip} onEditPhoto={(photo: Photo) => { setEditingPhoto({ tripId: activeTrip.id, photo }); setView('editor'); }} onBack={() => setView('dashboard')} language={language} darkMode={darkMode} userProfile={userProfile} />}
        {view === 'planner' && (
          <Planner 
            trips={trips.filter(t => t.status === 'future')} 
            onAddTrip={(t: Trip) => {
              setTrips(prev => [...prev, t]);
              updateDataTimestamp();
            }} 
            onUpdateTrip={handleUpdateTrip} 
            onDeleteTrip={handleDeleteTrip}
            onOpenTrip={openTrip} 
            language={language} 
            darkMode={darkMode} 
            userProfile={userProfile} 
            customEvents={customEvents} 
            onUpdateEvents={handleSetCustomEvents} 
            onImportData={handleImportData}
            dataTimestamp={dataTimestamp}
            fullData={{ trips, userProfile, customEvents }}
          />
        )}
        {view === 'calendar' && <Calendar trips={trips} customEvents={customEvents} language={language} darkMode={darkMode} userProfile={userProfile} onOpenTrip={openTrip} onUpdateEvents={handleSetCustomEvents} onCombineTrips={handleCombineTrips} />}
        {view === 'budget' && <Budget trips={trips} language={language} darkMode={darkMode} onUpdateTrip={handleUpdateTrip} />}
        {view === 'editor' && editingPhoto && activeTrip && <ImageEditor photo={editingPhoto.photo} trip={activeTrip} onSave={(url: string, type?: 'image' | 'video') => {
          const updatedPhotos = activeTrip.photos.map(p => p.id === editingPhoto.photo.id ? { ...p, url, type } : p);
          handleUpdateTrip({ ...activeTrip, photos: updatedPhotos });
          setView('trip-detail');
        }} onCancel={() => setView('trip-detail')} darkMode={darkMode} language={language} />}
        {view === 'settings' && (
          <Settings 
            language={language} 
            setLanguage={setLanguage} 
            darkMode={darkMode} 
            setDarkMode={setDarkMode} 
            fontSize={fontSize}
            setFontSize={setFontSize}
            onBack={() => setView('dashboard')} 
            userProfile={userProfile} 
            setUserProfile={handleSetUserProfile}
            fullData={{ trips, userProfile, customEvents }}
            onImportData={handleImportData}
          />
        )}
      </main>

      {showGuide && <UserGuide onClose={() => setShowGuide(false)} language={language} darkMode={darkMode} />}

      <nav className={`fixed bottom-0 left-0 right-0 border-t flex justify-around items-center h-20 safe-area-bottom z-50 transition-all duration-300 ${darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-zinc-200'} backdrop-blur-xl shadow-[0_-8px_30px_rgb(0,0,0,0.04)]`}>
        {[
          { id: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: t.journal },
          { id: 'planner', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: t.planner },
          { id: 'calendar', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: t.calendar },
          { id: 'budget', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: t.budgetFeature },
          { id: 'settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 01.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', label: t.settings }
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => setView(item.id as ViewState)} 
            className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-90 ${view === item.id ? (darkMode ? 'text-indigo-400' : 'text-indigo-600') : 'text-zinc-400'}`}
          >
            <div className={`p-1 rounded-full transition-all ${view === item.id ? (darkMode ? 'bg-indigo-400/10' : 'bg-indigo-600/5') : ''}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={view === item.id ? "2.5" : "2"} d={item.icon}/></svg>
            </div>
            <span className={`text-[10px] mt-1 font-black uppercase tracking-widest ${view === item.id ? 'opacity-100' : 'opacity-60'}`}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
