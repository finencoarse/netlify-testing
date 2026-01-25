
import React, { useState, useEffect, useRef } from 'react';
import { Language, UserProfile, FontSize } from '../types';
import { translations } from '../translations';
import { getMapUsage } from '../services/mapsService';
import { GeminiService } from '../services/geminiService';
import { SupabaseService } from '../services/supabaseService';

interface SettingsProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  onBack: () => void;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  fullData: any;
  onImportData: (data: any) => void;
}

const Settings: React.FC<SettingsProps> = ({ language, setLanguage, darkMode, setDarkMode, fontSize, setFontSize, onBack, userProfile, setUserProfile, fullData, onImportData }) => {
  const t = translations[language];
  
  const mapUsage = getMapUsage();
  const geminiUsage = GeminiService.getUsageCount();
  const isCloudActive = SupabaseService.isCloudActive();
  const isHardcoded = SupabaseService.isHardcoded();
  
  // Cloud Sync State
  const [syncId, setSyncId] = useState(() => localStorage.getItem('wanderlust_sync_id') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [inputSyncId, setInputSyncId] = useState('');
  const [isEditingId, setIsEditingId] = useState(false);
  const [tempId, setTempId] = useState('');

  // Custom Config State
  const [showConfig, setShowConfig] = useState(false);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

  // Country Search State
  const [countryQuery, setCountryQuery] = useState(userProfile.nationality);
  const [countryResults, setCountryResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize inputs from storage
  useEffect(() => {
    const stored = localStorage.getItem('wanderlust_custom_supabase');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSbUrl(parsed.supabaseUrl || '');
        setSbKey(parsed.supabaseKey || '');
      } catch (e) { console.error(e); }
    }
  }, []);

  // Generate a random ID if none exists
  useEffect(() => {
    if (!syncId) {
      const newId = Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('wanderlust_sync_id', newId);
      setSyncId(newId);
    }
  }, [syncId]);

  // Sync country query if profile updates externally
  useEffect(() => {
    setCountryQuery(userProfile.nationality);
  }, [userProfile.nationality]);

  // Country Search Effect
  useEffect(() => {
    // If query matches current and results aren't needed, skip
    if (countryQuery === userProfile.nationality && !showResults) return;

    if (!countryQuery.trim()) {
      setCountryResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await GeminiService.searchCountries(countryQuery, language);
        setCountryResults(results);
        setShowResults(true);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 600);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [countryQuery, language, userProfile.nationality, showResults]);

  const handleSelectCountry = (country: string) => {
    setUserProfile({ ...userProfile, nationality: country });
    setCountryQuery(country);
    setShowResults(false);
  };

  const handlePfpUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUserProfile({ ...userProfile, pfp: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      await SupabaseService.saveGlobalBackup(syncId, fullData);
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      if (e instanceof Error) {
        alert(e.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!inputSyncId.trim()) return;
    setIsSyncing(true);
    try {
      const targetId = inputSyncId.trim().toUpperCase();
      const data = await SupabaseService.loadGlobalBackup(targetId);
      if (data) {
        if (window.confirm(`Found backup for ID "${targetId}"! \n\nThis will overwrite your current local data and link your app to this ID for future backups.\n\nContinue?`)) {
          onImportData(data);
          
          // CRITICAL: Replace the generated ID with the user's input ID
          setSyncId(targetId);
          localStorage.setItem('wanderlust_sync_id', targetId);
          
          alert(`Restore successful! \nYour Sync ID is now: ${targetId}. \nFuture backups will overwrite this ID.`);
          setInputSyncId('');
        }
      } else {
        alert("No backup found for this ID.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to restore. Please check connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  const startEditingId = () => {
    setTempId(syncId);
    setIsEditingId(true);
  };

  const saveEditedId = async () => {
    const newId = tempId.trim().toUpperCase();
    
    // 1. Basic validation (Cancel if empty or unchanged)
    if (!newId || newId === syncId) {
      setIsEditingId(false);
      return;
    }

    // 2. Format validation
    if (newId.length < 4) {
      alert("ID must be at least 4 characters long.");
      return;
    }
    
    // Allow A-Z, 0-9, and hyphens only
    if (!/^[A-Z0-9-]+$/.test(newId)) {
      alert("ID can only contain uppercase letters, numbers, and hyphens.");
      return;
    }

    // 3. Collision Check
    setIsSyncing(true); // Show loading state
    try {
      const existingData = await SupabaseService.loadGlobalBackup(newId);
      
      let confirmMsg = `Switch Sync ID to "${newId}"?`;
      
      if (existingData) {
        confirmMsg = `⚠️ WARNING: ID ALREADY IN USE\n\nThe ID "${newId}" already has cloud data associated with it.\n\nIf you switch to this ID and click 'Backup Now', you will OVERWRITE the existing data.\n\nOnly proceed if this is YOUR ID.`;
      } else {
        confirmMsg += `\n\nThis ID appears to be available. It will be registered to you upon your first backup.`;
      }

      if (window.confirm(confirmMsg)) {
        setSyncId(newId);
        localStorage.setItem('wanderlust_sync_id', newId);
        setIsEditingId(false);
      }
    } catch (e) {
      console.error(e);
      alert("Could not verify ID availability. Please check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveConfig = () => {
    if (!sbUrl || !sbKey) {
      localStorage.removeItem('wanderlust_custom_supabase');
    } else {
      localStorage.setItem('wanderlust_custom_supabase', JSON.stringify({ supabaseUrl: sbUrl, supabaseKey: sbKey }));
    }
    window.location.reload(); // Reload to apply new config
  };

  // --- FILE EXPORT / IMPORT HANDLERS ---
  const handleExportFile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "wanderlust_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (window.confirm(t.importConfirm || "Overwrite current data with this file?")) {
          onImportData(json);
          alert(t.importSuccess || "Import successful!");
        }
      } catch (err) {
        console.error(err);
        alert(t.importError || "Invalid file format");
      }
    };
    reader.readAsText(file);
    // Reset value to allow re-importing same file if needed
    e.target.value = '';
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-8 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className={`p-3 rounded-2xl active:scale-90 transition-all ${darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-500'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="text-3xl font-black tracking-tight">{t.settings}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Profile Section */}
        <section className={`p-6 rounded-[2rem] border-2 space-y-6 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <h3 className="text-xl font-black">{t.myProfile}</h3>
          <div className="flex items-center gap-6">
            <div className="relative group cursor-pointer">
              <img src={userProfile.pfp} className="w-20 h-20 rounded-full object-cover shadow-lg" alt="Profile" />
              <label className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <input type="file" className="hidden" accept="image/*" onChange={handlePfpUpload} />
              </label>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.userName}</label>
              <input 
                value={userProfile.name} 
                onChange={(e) => setUserProfile({...userProfile, name: e.target.value})} 
                className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-700 font-bold outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          
          <div className="space-y-2 relative">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.selectCountry}</label>
            <div className="relative">
              <input 
                value={countryQuery}
                onChange={(e) => { setCountryQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                className={`w-full bg-transparent border-b border-zinc-200 dark:border-zinc-700 font-bold outline-none focus:border-indigo-500 transition-colors py-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}
                placeholder="Type to search..."
              />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                {isSearching ? (
                  <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                )}
              </div>
            </div>
            
            {showResults && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowResults(false)} />
                {countryResults.length > 0 && (
                  <div className={`absolute z-20 w-full mt-2 rounded-xl shadow-xl border max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                    {countryResults.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectCountry(c)}
                        className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-50 text-zinc-700'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Appearance Section */}
        <section className={`p-6 rounded-[2rem] border-2 space-y-6 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <h3 className="text-xl font-black">{t.appearance}</h3>
          
          <div className="flex items-center justify-between">
            <span className="font-bold">{t.darkMode}</span>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`w-14 h-8 rounded-full p-1 transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-zinc-200'}`}
            >
              <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="space-y-2">
             <span className="font-bold">{t.language}</span>
             <div className="grid grid-cols-2 gap-2">
               {(['en', 'zh-TW', 'ja', 'ko'] as const).map(lang => (
                 <button
                   key={lang}
                   onClick={() => setLanguage(lang)}
                   className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${language === lang ? 'bg-indigo-600 text-white border-indigo-600' : (darkMode ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400')}`}
                 >
                   {lang === 'en' && 'English'}
                   {lang === 'zh-TW' && '繁體中文'}
                   {lang === 'ja' && '日本語'}
                   {lang === 'ko' && '한국어'}
                 </button>
               ))}
             </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
             <span className="font-bold">{t.fontSize}</span>
             <div className="grid grid-cols-3 gap-2">
               {(['small', 'medium', 'large'] as const).map(size => (
                 <button
                   key={size}
                   onClick={() => setFontSize(size)}
                   className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${fontSize === size ? 'bg-indigo-600 text-white border-indigo-600' : (darkMode ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400')}`}
                 >
                   {t[size]}
                 </button>
               ))}
             </div>
          </div>
        </section>

        {/* Cloud Sync Section */}
        <section className={`p-6 rounded-[2rem] border-2 space-y-6 md:col-span-2 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className={`p-2 rounded-xl ${isCloudActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
               </div>
               <div>
                 <h3 className="text-xl font-black">{t.cloudSync}</h3>
                 <p className="text-xs font-bold opacity-50">{isCloudActive ? 'Connected to Cloud' : 'Offline Mode (Local Only)'}</p>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Your Sync ID</label>
                <button onClick={startEditingId} className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:underline">
                  Edit
                </button>
              </div>
              
              {isEditingId ? (
                <div className="flex gap-2">
                  <input 
                    value={tempId}
                    onChange={(e) => setTempId(e.target.value.toUpperCase())}
                    className={`flex-1 p-4 rounded-xl font-mono text-xl font-black tracking-widest outline-none border-2 focus:border-indigo-500 uppercase ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                    autoFocus
                  />
                  <button 
                    onClick={saveEditedId} 
                    disabled={isSyncing}
                    className="px-4 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50"
                  >
                    {isSyncing ? '...' : '✓'}
                  </button>
                </div>
              ) : (
                <div className={`p-4 rounded-xl font-mono text-2xl font-black text-center tracking-widest select-all ${darkMode ? 'bg-black' : 'bg-zinc-100'}`}>
                  {syncId}
                </div>
              )}

              <p className="text-xs leading-relaxed opacity-60">
                {t.backupDescription || "Securely backup your Trips, Budget, and Profile."}
              </p>
              <button 
                onClick={handleCloudSync} 
                disabled={isSyncing || !isCloudActive}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 ${syncStatus === 'success' ? 'bg-emerald-500 text-white' : (syncStatus === 'error' ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed')}`}
              >
                {isSyncing ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                   syncStatus === 'success' ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                )}
                {syncStatus === 'success' ? 'Backed Up!' : 'Backup Now'}
              </button>
            </div>

            <div className="space-y-4 pt-4 md:pt-0 md:border-l md:pl-8 border-dashed border-zinc-200 dark:border-zinc-800">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Restore from ID</label>
              <input 
                 value={inputSyncId}
                 onChange={(e) => setInputSyncId(e.target.value.toUpperCase())}
                 placeholder="ENTER ID HERE"
                 className={`w-full p-4 rounded-xl font-mono text-xl font-black text-center tracking-widest outline-none border-2 focus:border-indigo-500 transition-colors ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
              />
              <button 
                onClick={handleCloudRestore}
                disabled={isSyncing || !isCloudActive || !inputSyncId}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-widest border-2 border-dashed border-emerald-500 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.restore}
              </button>
              <p className="text-[10px] opacity-50 text-center">
                Restoring will replace your current Sync ID with the one above.
              </p>
            </div>
          </div>
        </section>

        {/* Data Management Section (Manual Export/Import) */}
        <section className={`p-6 rounded-[2rem] border-2 space-y-6 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <h3 className="text-xl font-black">Data Management</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleExportFile}
              className="py-4 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex flex-col items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              {t.exportData || "Export JSON"}
            </button>
            <label className="py-4 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex flex-col items-center gap-2 cursor-pointer">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m-4 0h12"/></svg>
              {t.importData || "Import JSON"}
              <input type="file" className="hidden" accept=".json" onChange={handleImportFile} />
            </label>
          </div>
        </section>

        {/* API Stats Section */}
        <section className={`p-6 rounded-[2rem] border-2 space-y-4 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <h3 className="text-xl font-black">{t.apiUsage}</h3>
          <div className="space-y-3">
             <div className={`flex justify-between items-center p-4 rounded-2xl ${darkMode ? 'bg-black border border-zinc-800' : 'bg-zinc-900 text-white'}`}>
                <span className="text-sm font-bold">{t.mapsUsage}</span>
                <span className={`font-mono font-black ${mapUsage > 4500 ? 'text-rose-500' : 'text-zinc-500'}`}>{mapUsage} <span className="text-zinc-600">/ 5000</span></span>
             </div>
             <div className={`flex justify-between items-center p-4 rounded-2xl ${darkMode ? 'bg-black border border-zinc-800' : 'bg-zinc-900 text-white'}`}>
                <span className="text-sm font-bold">{t.geminiUsage}</span>
                <span className="font-mono font-black text-zinc-500">{geminiUsage}</span>
             </div>
          </div>
        </section>
        
        {/* Custom Config Section */}
        {!isHardcoded && (
           <section className={`p-6 rounded-[2rem] border-2 space-y-4 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-black">Backend Config</h3>
                <button onClick={() => setShowConfig(!showConfig)} className="text-xs font-bold underline opacity-50">
                   {showConfig ? 'Hide' : 'Edit'}
                </button>
             </div>
             
             {showConfig && (
               <div className="space-y-4 animate-in fade-in">
                 <p className="text-xs opacity-60">
                    Provide your own Supabase project details to enable cloud sync.
                 </p>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Supabase URL</label>
                   <input 
                     value={sbUrl}
                     onChange={e => setSbUrl(e.target.value)}
                     className={`w-full p-2 rounded-lg text-xs font-mono outline-none border ${darkMode ? 'bg-black border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Supabase Anon Key</label>
                   <input 
                     type="password"
                     value={sbKey}
                     onChange={e => setSbKey(e.target.value)}
                     className={`w-full p-2 rounded-lg text-xs font-mono outline-none border ${darkMode ? 'bg-black border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
                 <button 
                   onClick={handleSaveConfig}
                   className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                 >
                   Save Configuration
                 </button>
               </div>
             )}
           </section>
        )}

      </div>
    </div>
  );
};

export default Settings;
