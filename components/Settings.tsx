
import React, { useState, useEffect } from 'react';
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

  // Custom Config State
  const [showConfig, setShowConfig] = useState(false);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

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
      const data = await SupabaseService.loadGlobalBackup(inputSyncId.trim().toUpperCase());
      if (data) {
        if (window.confirm("Found backup! Overwrite current data?")) {
          onImportData(data);
          // If restoring from another ID, assume user wants to adopt that ID
          setSyncId(inputSyncId.trim().toUpperCase());
          localStorage.setItem('wanderlust_sync_id', inputSyncId.trim().toUpperCase());
          alert("Restore successful!");
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

  const handleSaveConfig = () => {
    if (!sbUrl || !sbKey) {
      localStorage.removeItem('wanderlust_custom_supabase');
    } else {
      localStorage.setItem('wanderlust_custom_supabase', JSON.stringify({ supabaseUrl: sbUrl, supabaseKey: sbKey }));
    }
    window.location.reload(); // Reload to apply new config
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
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.selectCountry}</label>
            <input 
              value={userProfile.nationality} 
              onChange={(e) => setUserProfile({...userProfile, nationality: e.target.value})} 
              className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-700 font-bold outline-none focus:border-indigo-500 transition-colors"
            />
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
              <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Your Sync ID</label>
              <div className={`p-4 rounded-xl font-mono text-2xl font-black text-center tracking-widest select-all ${darkMode ? 'bg-black' : 'bg-zinc-100'}`}>
                {syncId}
              </div>
              <p className="text-xs leading-relaxed opacity-60">
                Use this ID to restore your data on another device. Keep it safe!
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
            </div>
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
