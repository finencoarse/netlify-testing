
import React from 'react';
import { ViewState, Language, UserProfile } from '../types';
import { translations } from '../translations';

interface HeaderProps {
  setView: (view: ViewState) => void;
  currentView: ViewState;
  language: Language;
  darkMode: boolean;
  userProfile: UserProfile;
  onShowGuide: () => void;
}

const Header: React.FC<HeaderProps> = ({ setView, currentView, language, darkMode, userProfile, onShowGuide }) => {
  const t = translations[language];

  return (
    <header className={`sticky top-0 z-40 w-full transition-all duration-300 ${darkMode ? 'bg-zinc-950/80' : 'bg-white/80'} backdrop-blur-xl border-b border-white/5`}>
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer active:scale-95 transition-transform" onClick={() => setView('dashboard')}>
          <div className="w-9 h-9 bg-black dark:bg-white rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 012.5 2.5V17m-12.293-2.293l1.414 1.414A2 2 0 0011.586 15H11a2 2 0 00-2 2v1a2 2 0 01-2 2H3.055a10.003 10.003 0 0114.158-14.158L15 7" />
            </svg>
          </div>
          <h1 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Wanderlust</h1>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onShowGuide} className={`p-2 rounded-xl active:bg-zinc-100 dark:active:bg-zinc-800 transition-all ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>
          <div onClick={() => setView('settings')} className="flex items-center active:scale-95 transition-transform">
            <img src={userProfile.pfp} alt={userProfile.name} className={`w-9 h-9 rounded-full object-cover border-2 shadow-sm ${darkMode ? 'border-zinc-800' : 'border-zinc-100'}`} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
