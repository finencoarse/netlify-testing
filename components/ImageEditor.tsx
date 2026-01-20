
import React, { useState, useEffect } from 'react';
import { Photo, Trip, Language } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';

interface ImageEditorProps {
  photo: Photo;
  trip: Trip;
  onSave: (url: string, type?: 'image' | 'video') => void;
  onCancel: () => void;
  darkMode: boolean;
  language: Language;
}

const FILTERS = [
  { name: 'Original', filter: 'none' },
  { name: 'Vivid', filter: 'contrast(1.2) saturate(1.4)' },
  { name: 'Mono', filter: 'grayscale(100%)' },
  { name: 'Warm', filter: 'sepia(30%) saturate(1.2) hue-rotate(-10deg)' },
  { name: 'Cool', filter: 'hue-rotate(180deg) saturate(1.1)' },
];

const ImageEditor: React.FC<ImageEditorProps> = ({ photo, trip, onSave, onCancel, darkMode, language }) => {
  const t = translations[language];
  const [currentPreview, setCurrentPreview] = useState(photo.url);
  const [activeFilter, setActiveFilter] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const isVideo = photo.type === 'video' || currentPreview.startsWith('blob:');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleAiRetouch = async () => {
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const result = await GeminiService.editImage(currentPreview, aiPrompt || "Enhance this travel photo, make it vibrant and professional.");
      if (result) setCurrentPreview(result);
    } catch (e) {
      alert("AI processing failed. Please check your connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyFilter = (filter: string) => {
    setActiveFilter(filter);
  };

  return (
    <div className={`max-w-5xl mx-auto animate-in zoom-in-95 duration-300 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t.mediaStudio}</h2>
          <p className="text-gray-500 text-sm">{t.enhanceMemories}</p>
        </div>
        <button 
          onClick={onCancel}
          className={`font-bold text-sm px-4 py-2 rounded-xl border transition-colors ${darkMode ? 'text-gray-400 border-zinc-800 hover:text-white hover:bg-zinc-800' : 'text-gray-500 border-gray-200 hover:text-black hover:bg-gray-50'}`}
        >
          {t.cancel}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Preview Area */}
        <div className="lg:col-span-7 space-y-6">
          <div className="relative aspect-[16/9] rounded-[2.5rem] overflow-hidden bg-black shadow-2xl group border-4 border-white/10">
            {isVideo ? (
              <video 
                src={currentPreview} 
                controls 
                className="w-full h-full object-contain"
                style={{ filter: activeFilter }}
              />
            ) : (
              <img 
                src={currentPreview} 
                alt="Preview" 
                className="w-full h-full object-contain"
                style={{ filter: activeFilter }}
              />
            )}
            
            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white z-10 animate-in fade-in">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <p className="font-bold tracking-widest text-xs uppercase animate-pulse">Gemini is working...</p>
              </div>
            )}
          </div>

          {/* Filters Bar */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.visualFilters}</label>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {FILTERS.map((f) => (
                <button
                  key={f.name}
                  onClick={() => applyFilter(f.filter)}
                  className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border ${activeFilter === f.filter ? (darkMode ? 'bg-white text-black border-white' : 'bg-black text-white border-black') : (darkMode ? 'bg-zinc-950 border-zinc-800 text-gray-400 hover:border-zinc-700' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50')}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Studio Controls */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div className={`p-8 rounded-[2.5rem] border space-y-6 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <div>
                  <h3 className="font-black text-lg">AI Studio</h3>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-[9px] font-black uppercase text-gray-500">{isOnline ? 'Connected' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.aiPrompt}</label>
                <textarea 
                  disabled={!isOnline}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Tell Gemini how to edit..."
                  className={`w-full p-4 rounded-2xl border-2 font-bold text-sm resize-none outline-none transition-all ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''} ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white focus:border-indigo-400' : 'bg-white border-gray-200 text-black focus:border-indigo-600'}`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={handleAiRetouch}
                  disabled={isProcessing || !isOnline}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg ${!isOnline ? 'bg-gray-300 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.183.12l-.18.09a2 2 0 00-1.178 1.948V17a2 2 0 002 2h14a2 2 0 002-2v-1.572a2 2 0 00-1.212-1.838l-.052-.022zM12 11V3m0 0l3 3m-3-3L9 6"/></svg>
                  {isProcessing ? 'Processing...' : 'AI Photo Retouch'}
                </button>
              </div>
              {!isOnline && (
                <p className="text-[10px] font-bold text-rose-500 text-center uppercase tracking-widest">Connect to internet to use AI tools</p>
              )}
            </div>
          </div>

          <button 
            onClick={() => onSave(currentPreview, isVideo ? 'video' : 'image')}
            className={`w-full py-4 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-xl ${darkMode ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'}`}
          >
            {t.exportSave}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;
