import React, { useState } from 'react';
import { Memo, Language } from '../types';
import { translations } from '../translations';

interface MemosProps {
  memos: Memo[];
  setMemos: (memos: Memo[]) => void;
  language: Language;
  darkMode: boolean;
}

const COLORS = ['#FFEB3B', '#FFCDD2', '#C8E6C9', '#BBDEFB', '#E1BEE7', '#F5F5F5'];

const Memos: React.FC<MemosProps> = ({ memos, setMemos, language, darkMode }) => {
  const t = translations[language];
  const [newMemoText, setNewMemoText] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const handleAddMemo = () => {
    if (!newMemoText.trim()) return;
    const memo: Memo = {
      id: Date.now().toString(),
      text: newMemoText,
      color: selectedColor,
      date: new Date().toISOString()
    };
    setMemos([memo, ...memos]);
    setNewMemoText('');
  };

  const deleteMemo = (id: string) => {
    setMemos(memos.filter(m => m.id !== id));
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t.memos}</h2>
        <p className="text-gray-500 mt-1">Quick thoughts and travel inspirations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className={`p-8 rounded-[2.5rem] border shadow-sm flex flex-col gap-6 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-100'}`}>
          <textarea value={newMemoText} onChange={(e) => setNewMemoText(e.target.value)} placeholder={t.memoPlaceholder} className="w-full h-32 bg-transparent resize-none focus:outline-none text-lg font-medium" />
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setSelectedColor(c)} className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-125 border-black dark:border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <button onClick={handleAddMemo} className="bg-black text-white dark:bg-white dark:text-black px-6 py-2 rounded-xl text-sm font-bold shadow-md">{t.addMemo}</button>
          </div>
        </div>

        {memos.map(memo => (
          <div key={memo.id} className="relative group p-8 rounded-[2.5rem] shadow-sm transform transition-all hover:rotate-1" style={{ backgroundColor: memo.color, color: '#333' }}>
            <button onClick={() => deleteMemo(memo.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-40 hover:opacity-100 transition-opacity">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
            <p className="text-lg font-medium whitespace-pre-wrap leading-relaxed">{memo.text}</p>
            <div className="mt-8 pt-4 border-t border-black/10 text-[10px] font-bold uppercase tracking-widest opacity-40">
              {new Date(memo.date).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Memos;