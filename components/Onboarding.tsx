
import React, { useState } from 'react';
import { UserProfile, Language } from '../types';
import { translations } from '../translations';

interface OnboardingProps {
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  language: Language;
  onComplete: () => void;
}

const COUNTRIES = [
  "United States", "China", "Hong Kong", "Taiwan", "United Kingdom", "Japan"
];

const Onboarding: React.FC<OnboardingProps> = ({ userProfile, setUserProfile, darkMode, setDarkMode, language, onComplete }) => {
  const t = translations[language];
  const [step, setStep] = useState(1);

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

  const primaryBtnClass = `w-full py-5 rounded-3xl font-black text-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
    bg-zinc-950 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]
    dark:bg-white dark:text-zinc-950 dark:shadow-[0_10px_30px_-10px_rgba(255,255,255,0.3)] dark:hover:shadow-[0_20px_40px_-10px_rgba(255,255,255,0.4)]`;

  const secondaryBtnClass = `w-full py-3 font-bold text-sm transition-colors
    text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300`;

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-500 ${darkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>
      <div className="max-w-md w-full space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center space-y-4">
          <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-8 transition-all duration-500 ${darkMode ? 'bg-white shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]' : 'bg-zinc-950 shadow-[0_0_40px_-10px_rgba(0,0,0,0.3)]'}`}>
            <svg className={`w-10 h-10 ${darkMode ? 'text-zinc-950' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 012.5 2.5V17m-12.293-2.293l1.414 1.414A2 2 0 0011.586 15H11a2 2 0 00-2 2v1a2 2 0 01-2 2H3.055a10.003 10.003 0 0114.158-14.158L15 7" /></svg>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">{t.welcome}</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">{t.onboardingSub}</p>
        </div>

        {step === 1 && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col items-center space-y-8">
              <div className="relative group cursor-pointer">
                <div className={`absolute inset-0 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity ${darkMode ? 'bg-white' : 'bg-black'}`}></div>
                <img 
                  src={userProfile.pfp} 
                  className={`relative w-36 h-36 rounded-full object-cover border-4 shadow-2xl transition-transform group-hover:scale-105 ${darkMode ? 'border-zinc-800' : 'border-white ring-4 ring-zinc-50'}`} 
                  alt="PFP" 
                />
                <label className="absolute inset-0 bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer z-10 backdrop-blur-sm">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <input type="file" className="hidden" accept="image/*" onChange={handlePfpUpload} />
                </label>
              </div>
              
              <div className="w-full space-y-3">
                <label className="text-xs font-black text-zinc-400 uppercase tracking-widest text-center block">{t.userName}</label>
                <input 
                  type="text" 
                  value={userProfile.name}
                  onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                  placeholder="e.g. Marco Polo"
                  className={`w-full text-3xl font-black text-center bg-transparent border-b-2 py-3 focus:outline-none transition-all ${darkMode ? 'border-zinc-800 focus:border-white placeholder-zinc-800' : 'border-zinc-200 focus:border-black placeholder-zinc-200'}`}
                />
              </div>
            </div>
            
            <button 
              onClick={() => setStep(2)}
              disabled={!userProfile.name.trim()}
              className={primaryBtnClass}
            >
              {t.next}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
            <div className="space-y-6">
              <h3 className="text-xl font-black text-center">{t.selectCountry}</h3>
              <div className="max-h-[340px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {COUNTRIES.map(country => {
                  const isSelected = userProfile.nationality === country;
                  return (
                    <button
                      key={country}
                      onClick={() => setUserProfile({ ...userProfile, nationality: country })}
                      className={`w-full p-5 rounded-2xl text-left font-bold transition-all duration-300
                        ${isSelected 
                          ? (darkMode 
                              ? 'bg-white text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-[1.02]' 
                              : 'bg-zinc-950 text-white shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] scale-[1.02]')
                          : (darkMode
                              ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                              : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 border border-transparent hover:border-zinc-200')
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{country}</span>
                        {isSelected && (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={() => setStep(3)}
                disabled={!userProfile.nationality}
                className={primaryBtnClass}
              >
                {t.next}
              </button>
              <button onClick={() => setStep(1)} className={secondaryBtnClass}>
                {t.back}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-10 animate-in slide-in-from-right-8 duration-500">
            <div className="space-y-8 text-center">
              <h3 className="text-xl font-black">{t.chooseTheme}</h3>
              <div className="grid grid-cols-2 gap-6">
                <button 
                  onClick={() => setDarkMode(false)}
                  className={`group p-8 rounded-[2rem] border-2 transition-all duration-300 flex flex-col items-center gap-6 relative overflow-hidden
                    ${!darkMode 
                      ? 'border-zinc-950 bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.2)] scale-105 ring-4 ring-zinc-100' 
                      : 'border-zinc-800 bg-zinc-900/50 opacity-60 hover:opacity-100 hover:border-zinc-700'}`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors shadow-lg
                    ${!darkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-950'}`}>
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.243 17.657l.707-.707M7.757 6.364l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                  </div>
                  <span className="font-black tracking-widest uppercase text-sm">Light</span>
                  {!darkMode && <div className="absolute top-4 right-4 text-emerald-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></div>}
                </button>

                <button 
                  onClick={() => setDarkMode(true)}
                  className={`group p-8 rounded-[2rem] border-2 transition-all duration-300 flex flex-col items-center gap-6 relative overflow-hidden
                    ${darkMode 
                      ? 'border-white bg-zinc-950 shadow-[0_10px_30px_-10px_rgba(255,255,255,0.2)] scale-105 ring-4 ring-zinc-800' 
                      : 'border-zinc-200 bg-zinc-50 opacity-60 hover:opacity-100 hover:border-zinc-300'}`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors shadow-lg
                    ${darkMode ? 'bg-white text-zinc-950' : 'bg-zinc-950 text-white'}`}>
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                  </div>
                  <span className="font-black tracking-widest uppercase text-sm">Dark</span>
                  {darkMode && <div className="absolute top-4 right-4 text-emerald-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></div>}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <button 
                onClick={onComplete}
                className={primaryBtnClass}
              >
                {t.startJourney}
              </button>
              <button onClick={() => setStep(2)} className={secondaryBtnClass}>
                {t.back}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
