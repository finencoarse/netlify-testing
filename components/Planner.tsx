
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trip, Language, UserProfile, CustomEvent, TripVersion, ItineraryItem } from '../types';
import { translations } from '../translations';
import { SupabaseService } from '../services/supabaseService';
import { GeminiService } from '../services/geminiService';

interface PlannerProps {
  trips: Trip[];
  onAddTrip: (trip: Trip) => void;
  onUpdateTrip: (trip: Trip) => void;
  onDeleteTrip: (id: string) => void;
  onOpenTrip: (id: string) => void;
  language: Language;
  darkMode: boolean;
  userProfile: UserProfile;
  customEvents: CustomEvent[];
  onUpdateEvents: (events: CustomEvent[]) => void;
  onImportData: (data: any) => void;
  dataTimestamp: number;
  fullData: { trips: Trip[], userProfile: UserProfile, customEvents: CustomEvent[] };
}

const Planner: React.FC<PlannerProps> = ({ 
  trips, 
  onAddTrip, 
  onUpdateTrip, 
  onDeleteTrip,
  onOpenTrip, 
  language, 
  darkMode, 
  userProfile,
  customEvents,
  onUpdateEvents,
  onImportData,
  dataTimestamp,
  fullData
}) => {
  const t = translations[language];
  const [showForm, setShowForm] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  
  // Planner Mode
  const [plannerMode, setPlannerMode] = useState<'manual' | 'ai'>('manual');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Cloud Versioning State
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versions, setVersions] = useState<TripVersion[]>([]);
  const [versionNote, setVersionNote] = useState('');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Delete Confirmation State
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formState, setFormState] = useState({
    title: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
    budget: 1000
  });

  const handleEditClick = (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingTripId(trip.id);
    setFormState({
      title: trip.title,
      location: trip.location,
      startDate: trip.startDate,
      endDate: trip.endDate,
      description: trip.description,
      budget: trip.budget || 0
    });
    setPlannerMode('manual'); // Editing is always manual
    setShowVersionPanel(false);
    setVersions([]);
    setSearchQuery('');
    setShowForm(true);
  };

  const handleRequestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setTripToDelete(id);
  };

  const handleConfirmDelete = () => {
    if (tripToDelete) {
      onDeleteTrip(tripToDelete);
      setTripToDelete(null);
      setToastMessage("Trip deleted successfully");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const loadVersions = async () => {
    if (!editingTripId) return;
    setIsLoadingVersions(true);
    try {
      const v = await SupabaseService.getTripVersions(editingTripId);
      setVersions(v);
    } catch (error) {
      console.error(error);
      alert("Failed to load versions. Check connection.");
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleSearchVersions = async () => {
    if (!searchQuery.trim()) return;
    setIsLoadingVersions(true);
    try {
      const v = await SupabaseService.findVersions(searchQuery.trim());
      setVersions(v);
    } catch (error) {
      alert("Search failed. Ensure ID is correct.");
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleSaveVersion = async () => {
    if (!editingTripId) return;
    const currentTrip = trips.find(t => t.id === editingTripId);
    if (!currentTrip) return;
    
    const tripToSave = { ...currentTrip, ...formState };

    setIsLoadingVersions(true);
    try {
      await SupabaseService.saveTripVersion(tripToSave, versionNote || 'Auto-save');
      setVersionNote('');
      setToastMessage("Version saved to Cloud!");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      await loadVersions();
    } catch (e) {
      alert("Failed to save version.");
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleRestoreVersion = (version: TripVersion) => {
    if (!editingTripId) return;
    const isDifferentId = version.data.id !== editingTripId;
    const msg = isDifferentId 
      ? `⚠️ This version is from a different Trip ID.\nRestoring will OVERWRITE the current trip content with data from "${version.data.title}".\nContinue?`
      : `Restore version from ${new Date(version.timestamp).toLocaleString()}? Current unsaved changes will be lost.`;

    if (window.confirm(msg)) {
      const restoredTrip = { ...version.data, id: editingTripId };
      onUpdateTrip(restoredTrip);
      setFormState({
        title: restoredTrip.title,
        location: restoredTrip.location,
        startDate: restoredTrip.startDate,
        endDate: restoredTrip.endDate,
        description: restoredTrip.description,
        budget: restoredTrip.budget || 0
      });
      setToastMessage("Version restored successfully.");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      setShowVersionPanel(false);
    }
  };

  const handleAiGeneration = async () => {
    if (!formState.location || !formState.startDate || !formState.endDate) {
      alert("Please fill in Location, Start Date, and End Date.");
      return;
    }

    const start = new Date(formState.startDate);
    const end = new Date(formState.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    setIsGenerating(true);
    try {
      // Pass currency symbol based on user input or default to user locale currency logic if needed
      // Here we assume '$' or try to extract from previous data, defaulting to user profile logic is hard without currency field.
      // We will let Gemini use the currency passed or default.
      const currencySymbol = '$'; 
      
      const aiData = await GeminiService.generateTripItinerary(
        formState.location,
        diffDays,
        formState.budget,
        currencySymbol,
        formState.description, // User intent/interests
        language
      );

      if (aiData && aiData.itinerary) {
        // Map day numbers "1", "2" to actual dates "2024-05-01", "2024-05-02"
        const mappedItinerary: Record<string, ItineraryItem[]> = {};
        
        Object.entries(aiData.itinerary).forEach(([dayNum, events]) => {
          const dayIndex = parseInt(dayNum) - 1;
          if (dayIndex >= 0 && dayIndex < diffDays) {
            const date = new Date(start);
            date.setDate(date.getDate() + dayIndex);
            const dateStr = date.toISOString().split('T')[0];
            
            // Assign IDs to items
            const mappedEvents = (events as any[]).map((evt: any) => ({
              ...evt,
              id: Math.random().toString(36).substr(2, 9)
            }));
            
            mappedItinerary[dateStr] = mappedEvents;
          }
        });

        // Construct full trip object
        const newTrip: Trip = {
          id: Date.now().toString(),
          title: aiData.title || `${formState.location} Adventure`,
          location: formState.location,
          startDate: formState.startDate,
          endDate: formState.endDate,
          description: aiData.description || formState.description,
          budget: formState.budget,
          status: 'future',
          coverImage: `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=800&auto=format&fit=crop`,
          photos: [],
          comments: [],
          rating: 0,
          dayRatings: {},
          itinerary: mappedItinerary,
          favoriteDays: [],
          defaultCurrency: currencySymbol
        };

        onAddTrip(newTrip);
        setShowForm(false);
        resetForm();
        setToastMessage("Trip generated successfully!");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } else {
        alert("AI could not generate the trip. Please try again with different details.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (plannerMode === 'ai') {
      handleAiGeneration();
      return;
    }

    if (!formState.startDate || !formState.endDate) return;
    
    if (editingTripId) {
      const existingTrip = trips.find(t => t.id === editingTripId);
      if (existingTrip) {
        onUpdateTrip({ ...existingTrip, ...formState });
      }
    } else {
      const trip: Trip = {
        id: Date.now().toString(),
        ...formState,
        status: 'future',
        coverImage: `https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=800&auto=format&fit=crop`,
        photos: [],
        comments: [],
        rating: 0,
        dayRatings: {},
        itinerary: {},
        favoriteDays: [],
        budget: formState.budget
      };
      onAddTrip(trip);
    }
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setFormState({
      title: '',
      location: '',
      startDate: '',
      endDate: '',
      description: '',
      budget: 1000
    });
    setEditingTripId(null);
    setPlannerMode('manual');
  };

  const daysInMonth = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  }, [calendarViewDate]);

  const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateClick = (date: Date) => {
    const dateStr = toLocalISOString(date);
    if (!formState.startDate || (formState.startDate && formState.endDate)) {
      setFormState({ ...formState, startDate: dateStr, endDate: '' });
    } else {
      if (dateStr < formState.startDate) {
        setFormState({ ...formState, startDate: dateStr, endDate: formState.startDate });
      } else {
        setFormState({ ...formState, endDate: dateStr });
      }
      setShowCalendar(false);
    }
  };

  const handleExport = () => {
    const backupData = { ...fullData, meta: { timestamp: Date.now(), version: '1.0' } };
    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wanderlust_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage(t.backupSuccess);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.trips) {
          if (window.confirm(t.importConfirm)) {
            onImportData(json);
            setToastMessage(t.importSuccess);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          }
        } else {
          alert(t.importError);
        }
      } catch (err) {
        console.error(err);
        alert(t.importError);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const isSelected = (dateStr: string) => dateStr === formState.startDate || dateStr === formState.endDate;
  const isInRange = (dateStr: string) => {
    if (!formState.startDate || !formState.endDate) return false;
    return dateStr > formState.startDate && dateStr < formState.endDate;
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12 relative">
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h2 className={`text-3xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{t.futureEscapes}</h2>
          <p className="text-zinc-500 font-bold text-sm tracking-tight">{t.dreamDesignDo}</p>
        </div>
        {!showForm && (
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={() => { resetForm(); setShowForm(true); }} className="flex-[2] bg-black dark:bg-white text-white dark:text-black py-5 rounded-[1.5rem] text-sm font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all">
              {t.planATrip}
            </button>
            <div className="flex-1 flex gap-2">
              <button onClick={handleExport} className={`flex-1 border-2 py-5 rounded-[1.5rem] text-[10px] sm:text-xs font-black shadow-lg hover:shadow-xl uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 ${darkMode ? 'bg-zinc-900 text-indigo-400 border-indigo-900/50' : 'bg-white text-indigo-600 border-indigo-100'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                {t.exportData}
              </button>
              <button onClick={handleImportClick} className={`flex-1 border-2 py-5 rounded-[1.5rem] text-[10px] sm:text-xs font-black shadow-lg hover:shadow-xl uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 ${darkMode ? 'bg-zinc-900 text-emerald-400 border-emerald-900/50' : 'bg-white text-emerald-600 border-emerald-100'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m-4 4v12"/></svg>
                {t.importData}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className={`border-2 rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-top-4 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{editingTripId ? t.editJourney : t.newJourney}</h3>
            
            {/* Mode Toggle - Only show if not editing existing trip */}
            {!editingTripId && (
              <div className={`flex p-1 rounded-xl ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                <button 
                  type="button"
                  onClick={() => setPlannerMode('manual')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${plannerMode === 'manual' ? (darkMode ? 'bg-zinc-600 text-white' : 'bg-white text-black shadow-sm') : 'text-zinc-500'}`}
                >
                  {t.manualMode}
                </button>
                <button 
                  type="button"
                  onClick={() => setPlannerMode('ai')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1 ${plannerMode === 'ai' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500'}`}
                >
                  {t.aiMode}
                </button>
              </div>
            )}
            
            {editingTripId && (
              <button onClick={() => { if (!showVersionPanel) loadVersions(); setShowVersionPanel(!showVersionPanel); }} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${showVersionPanel ? 'bg-indigo-600 text-white border-indigo-600' : (darkMode ? 'text-indigo-400 border-indigo-900' : 'text-indigo-600 border-indigo-100')}`}>
                {showVersionPanel ? 'Back to Edit' : 'Cloud Versions'}
              </button>
            )}
          </div>

          {showVersionPanel ? (
            /* Version Control Panel */
            <div className="space-y-6 animate-in fade-in">
              <div className={`p-4 rounded-2xl border-2 space-y-4 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-100'}`}>
                <h4 className={`text-sm font-black uppercase tracking-widest ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Create Snapshot</h4>
                <div className="flex gap-2">
                  <input value={versionNote} onChange={(e) => setVersionNote(e.target.value)} placeholder="e.g. Draft..." className={`flex-1 p-3 rounded-xl border font-bold text-sm outline-none ${darkMode ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-600' : 'bg-white border-zinc-200 placeholder-zinc-400'}`} />
                  <button onClick={handleSaveVersion} disabled={isLoadingVersions} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50">{isLoadingVersions ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className={`text-sm font-black uppercase tracking-widest ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>History</h4>
                {versions.length === 0 ? <p className="text-xs text-center py-4 opacity-50">No versions found.</p> : (
                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                    {versions.map((v) => (
                      <div key={v.id} className={`p-4 rounded-xl border flex justify-between items-center ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                        <div><p className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{v.note}</p><p className="text-[10px] text-zinc-500">{new Date(v.timestamp).toLocaleString()}</p></div>
                        <button onClick={() => handleRestoreVersion(v)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-emerald-50 text-emerald-600">Restore</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Trip Form */
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                {/* Title is hidden in AI mode, generated automatically */}
                {plannerMode === 'manual' && (
                  <div className="space-y-2">
                    <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${darkMode ? 'text-white' : 'text-zinc-500'}`}>{t.tripName}</label>
                    <input required placeholder="Trip Name..." value={formState.title} onChange={e => setFormState({...formState, title: e.target.value})} className={`w-full bg-transparent border-b-2 py-3 text-xl font-black outline-none ${darkMode ? 'border-zinc-800 text-white' : 'border-zinc-100 text-zinc-900'}`} />
                  </div>
                )}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${darkMode ? 'text-white' : 'text-zinc-500'}`}>{t.destination}</label>
                  <input required placeholder="Location (e.g., Tokyo, Japan)..." value={formState.location} onChange={e => setFormState({...formState, location: e.target.value})} className={`w-full bg-transparent border-b-2 py-3 text-xl font-black outline-none ${darkMode ? 'border-zinc-800 text-white' : 'border-zinc-100 text-zinc-900'}`} />
                </div>
              </div>

              <div className="space-y-6">
                <div className="relative space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${darkMode ? 'text-white' : 'text-zinc-500'}`}>{t.tripSchedule}</label>
                  <button type="button" onClick={() => setShowCalendar(!showCalendar)} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 text-sm font-black transition-all ${showCalendar ? 'border-indigo-500' : (darkMode ? 'border-zinc-800 text-white' : 'border-zinc-100')}`}>
                    <span>{formState.startDate ? `${formState.startDate} ${formState.endDate ? '→ ' + formState.endDate : ''}` : t.chooseDates}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {showCalendar && (
                    <div className={`absolute top-full left-1/2 -translate-x-1/2 w-full max-w-[320px] mt-2 z-50 p-4 rounded-[1.5rem] border-2 shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                      <div className="flex justify-between items-center mb-4">
                        <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{calendarViewDate.toLocaleString(language, { month: 'long', year: 'numeric' })}</h4>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1))} className="p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg></button>
                          <button type="button" onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1))} className="p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {daysInMonth.map((date, idx) => (
                          date ? 
                          <button key={idx} type="button" onClick={() => handleDateClick(date)} className={`aspect-square rounded-lg text-[10px] font-black ${isSelected(toLocalISOString(date)) ? 'bg-indigo-600 text-white' : (isInRange(toLocalISOString(date)) ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400')}`}>{date.getDate()}</button> : <div key={idx} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${darkMode ? 'text-white' : 'text-zinc-500'}`}>{t.budget}</label>
                  <input required type="number" value={formState.budget} onChange={e => setFormState({...formState, budget: parseFloat(e.target.value) || 0})} className={`w-full p-4 rounded-2xl border-2 text-xl font-black outline-none ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-100 text-zinc-900'}`} />
                </div>
                
                {/* Description Field - Acts as Trip Intent for AI Mode */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${darkMode ? 'text-white' : 'text-zinc-500'}`}>
                    {plannerMode === 'ai' ? t.tripIntent : t.briefDescription}
                  </label>
                  <textarea 
                    rows={plannerMode === 'ai' ? 4 : 2} 
                    value={formState.description} 
                    onChange={e => setFormState({...formState, description: e.target.value})} 
                    placeholder={plannerMode === 'ai' ? t.tripIntentPlaceholder : ""}
                    className={`w-full p-4 rounded-2xl border-2 font-black resize-none outline-none transition-all ${plannerMode === 'ai' ? 'focus:border-indigo-500 border-indigo-200' : ''} ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-100 text-zinc-900'}`} 
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  type="submit" 
                  disabled={isGenerating}
                  className={`w-full py-5 rounded-2xl font-black shadow-xl uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${plannerMode === 'ai' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-black dark:bg-white text-white dark:text-black'}`}
                >
                  {isGenerating ? (
                    <>
                       <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       {t.generatingTrip}
                    </>
                  ) : (
                    plannerMode === 'ai' ? t.generate : t.save
                  )}
                </button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="w-full py-2 font-black uppercase tracking-widest text-xs text-zinc-400">{t.cancel}</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Simplified Trip Card Grid */}
      <div className="grid grid-cols-1 gap-4">
        {trips.map(trip => (
          <div 
            key={trip.id} 
            onClick={() => onOpenTrip(trip.id)}
            className={`relative p-6 rounded-[2rem] border-2 group cursor-pointer transition-all active:scale-98 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <h3 className={`text-2xl font-black tracking-tight leading-none transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'} group-hover:text-indigo-600 pr-10`}>{trip.title}</h3>
                <p className="text-sm font-bold text-zinc-400">{trip.location}</p>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={(e) => handleRequestDelete(e, trip.id)}
                  className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-rose-500 transition-colors z-20 relative"
                  title="Delete Trip"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
                <button 
                  type="button"
                  onClick={(e) => handleEditClick(e, trip)}
                  className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-indigo-500 transition-colors z-20 relative"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </button>
                <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md">
                  {t.upcoming}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between border-t-2 dark:border-zinc-800 pt-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t.starts}</span>
                <span className={`text-sm font-black tabular-nums ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{trip.startDate}</span>
              </div>
              <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t.budget}</span>
                <span className={`text-xl font-black tabular-nums ${darkMode ? 'text-white' : 'text-zinc-900'}`}>${trip.budget || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {tripToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTripToDelete(null)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <h3 className={`text-xl font-black mb-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Delete Trip?</h3>
            <p className="text-sm text-zinc-500 font-bold mb-6">This action cannot be undone. All data will be lost.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setTripToDelete(null)} 
                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest ${darkMode ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDelete} 
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-white dark:text-black text-white px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-6 flex items-center gap-3 z-50 w-max max-w-[90vw]">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
          <span className="text-xs font-black tracking-tight">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default Planner;
