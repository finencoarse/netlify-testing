import React from 'react';
import { Language } from '../types';
import { translations } from '../translations';

interface UserGuideProps {
  onClose: () => void;
  language: Language;
  darkMode: boolean;
}

const UserGuide: React.FC<UserGuideProps> = ({ onClose, language, darkMode }) => {
  const t = translations[language];

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className={`w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right-full duration-500 relative flex flex-col ${darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'}`}>
        <div className="p-8 flex justify-between items-center border-b dark:border-zinc-800">
          <h2 className="text-2xl font-bold tracking-tight">{t.userGuide}</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-12">
          <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">{t.guideIntro}</p>

          <section className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <h3 className="font-bold text-lg">AI Studio</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-14">
              Use Gemini AI to enhance your travel photos or generate cinematic travel vlogs with a single prompt. Note: Internet connection is required.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <h3 className="font-bold text-lg">{t.planner}</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-14">
              {t.guidePlanning}
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <h3 className="font-bold text-lg">{t.journal}</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-14">
              {t.guideJournaling}
            </p>
          </section>
        </div>

        <div className="p-8 border-t dark:border-zinc-800">
          <button 
            onClick={onClose}
            className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;