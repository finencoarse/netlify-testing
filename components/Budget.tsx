
import React, { useState, useMemo } from 'react';
import { Trip, Language, ItineraryItem, ExpensePart } from '../types';
import { translations } from '../translations';

interface BudgetProps {
  trips: Trip[];
  language: Language;
  darkMode: boolean;
  onUpdateTrip: (trip: Trip) => void;
}

const Budget: React.FC<BudgetProps> = ({ trips, language, darkMode, onUpdateTrip }) => {
  const t = translations[language];
  const [selectedTripId, setSelectedTripId] = useState<string | null>(trips[0]?.id || null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  // Edit Form State for Expenses
  const [editForm, setEditForm] = useState<{
    actualExpense: number;
    estimatedExpense: number;
    expenseParts: ExpensePart[];
  }>({ actualExpense: 0, estimatedExpense: 0, expenseParts: [] });

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  const stats = useMemo(() => {
    if (!selectedTrip) return { totalBudget: 0, totalSpent: 0, totalEstimated: 0 };
    
    let totalSpent = 0;
    let totalEstimated = 0;
    
    (Object.values(selectedTrip.itinerary).flat() as ItineraryItem[]).forEach(item => {
      totalSpent += item.actualExpense || 0;
      totalEstimated += item.estimatedExpense || 0;
    });

    return {
      totalBudget: selectedTrip.budget || 0,
      totalSpent,
      totalEstimated
    };
  }, [selectedTrip]);

  const handleEditItem = (item: ItineraryItem) => {
    setEditingItemId(item.id);
    setEditForm({
      actualExpense: item.actualExpense || 0,
      estimatedExpense: item.estimatedExpense || 0,
      expenseParts: item.expenseParts ? [...item.expenseParts] : []
    });
  };

  const handleSaveExpense = () => {
    if (!selectedTrip || !editingItemId) return;
    
    // Calculate sum from parts if they exist and are not uncounted
    const partsSum = editForm.expenseParts.reduce((acc, part) => acc + (part.isUncounted ? 0 : (Number(part.amount) || 0)), 0);
    
    // If parts exist, actualExpense should ideally match partsSum, but we allow manual override or auto-update
    // Here we prefer the manual input if it differs significantly, or update if parts changed
    const finalActual = editForm.expenseParts.length > 0 ? partsSum : editForm.actualExpense;

    const newItinerary = { ...selectedTrip.itinerary };
    for (const date in newItinerary) {
      newItinerary[date] = newItinerary[date].map(item => {
        if (item.id === editingItemId) {
          return {
            ...item,
            actualExpense: finalActual,
            estimatedExpense: editForm.estimatedExpense,
            expenseParts: editForm.expenseParts
          };
        }
        return item;
      });
    }

    onUpdateTrip({ ...selectedTrip, itinerary: newItinerary });
    setEditingItemId(null);
  };

  const handleAddPart = () => {
    const newPart: ExpensePart = {
      id: Date.now().toString(),
      label: '',
      amount: 0,
      isUncounted: false
    };
    setEditForm(prev => ({ ...prev, expenseParts: [...prev.expenseParts, newPart] }));
  };

  const handleRemovePart = (index: number) => {
    const newParts = [...editForm.expenseParts];
    newParts.splice(index, 1);
    setEditForm(prev => ({ ...prev, expenseParts: newParts }));
  };

  const handleUpdatePart = (index: number, field: keyof ExpensePart, value: any) => {
    const newParts = [...editForm.expenseParts];
    newParts[index] = { ...newParts[index], [field]: value };
    setEditForm(prev => ({ ...prev, expenseParts: newParts }));
  };

  // Group items by day for list view
  const allItems = useMemo(() => {
    if (!selectedTrip) return [];
    return Object.entries(selectedTrip.itinerary).flatMap(([date, items]) => 
      (items as ItineraryItem[]).map(i => ({ ...i, date }))
    ).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedTrip]);

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight">{t.budgetFeature}</h2>
          <p className="text-sm font-bold opacity-50">{t.budgetIntro}</p>
        </div>
        
        {trips.length > 0 && (
          <select 
            value={selectedTripId || ''} 
            onChange={e => setSelectedTripId(e.target.value)}
            className={`p-3 rounded-xl text-xs font-black uppercase tracking-widest outline-none border-2 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
          >
            {trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
      </div>

      {selectedTrip ? (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.totalBudget}</div>
                <div className="text-3xl font-black">{selectedTrip.defaultCurrency}{stats.totalBudget.toLocaleString()}</div>
             </div>
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.totalSpent}</div>
                <div className={`text-3xl font-black ${stats.totalSpent > stats.totalBudget ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {selectedTrip.defaultCurrency}{stats.totalSpent.toLocaleString()}
                </div>
             </div>
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.remaining}</div>
                <div className="text-3xl font-black">{selectedTrip.defaultCurrency}{(stats.totalBudget - stats.totalSpent).toLocaleString()}</div>
             </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold opacity-60">
               <span>Progress</span>
               <span>{Math.min(100, Math.round((stats.totalSpent / (stats.totalBudget || 1)) * 100))}%</span>
            </div>
            <div className={`h-4 w-full rounded-full overflow-hidden ${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
               <div 
                 className={`h-full transition-all duration-1000 ${stats.totalSpent > stats.totalBudget ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                 style={{ width: `${Math.min(100, (stats.totalSpent / (stats.totalBudget || 1)) * 100)}%` }}
               />
            </div>
          </div>

          {/* Expense List */}
          <div className="space-y-4">
             <h3 className="text-xl font-black">{t.spendingDetail}</h3>
             <div className="space-y-2">
                {allItems.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => handleEditItem(item)}
                    className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] ${darkMode ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-100 hover:shadow-lg'}`}
                  >
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg">
                           {item.type === 'eating' ? '🍱' : item.type === 'shopping' ? '🛍️' : item.type === 'transport' ? '🚗' : '✨'}
                        </div>
                        <div>
                           <div className="font-bold">{item.title}</div>
                           <div className="text-xs opacity-50">{item.date}</div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="font-black text-lg">{item.currency}{item.actualExpense}</div>
                        <div className="text-[10px] opacity-40 uppercase font-bold tracking-widest">Est: {item.estimatedExpense}</div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 opacity-50">No trips available.</div>
      )}

      {/* Edit Modal */}
      {editingItemId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingItemId(null)} />
          <div className={`relative w-full max-w-md p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">Edit Expense</h3>
             
             <div className="space-y-6">
               {/* Main Cost Inputs */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.actualCost}</label>
                   <input 
                     type="number"
                     placeholder="0"
                     value={editForm.actualExpense === 0 ? '' : editForm.actualExpense}
                     onChange={(e) => setEditForm({ ...editForm, actualExpense: parseFloat(e.target.value) || 0 })}
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated}</label>
                   <input 
                     type="number"
                     placeholder="0"
                     value={editForm.estimatedExpense === 0 ? '' : editForm.estimatedExpense}
                     onChange={(e) => setEditForm({ ...editForm, estimatedExpense: parseFloat(e.target.value) || 0 })}
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
               </div>

               {/* Detailed Breakdown */}
               <div className="space-y-3">
                 <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Bill Breakdown</label>
                    <button 
                      onClick={handleAddPart}
                      className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2 py-1 rounded-lg transition-colors"
                    >
                      + Add Item
                    </button>
                 </div>
                 
                 <div className="space-y-2">
                   {(editForm.expenseParts || []).map((part, index) => (
                     <div key={part.id} className={`flex gap-2 items-center animate-in slide-in-from-left-2 transition-all ${part.isUncounted ? 'opacity-40 grayscale' : ''}`}>
                       <button 
                         onClick={() => handleUpdatePart(index, 'isUncounted', !part.isUncounted)}
                         title="Cheat: Don't count this in total"
                         className={`p-2.5 rounded-xl transition-all ${part.isUncounted ? 'bg-indigo-100 text-indigo-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400'}`}
                       >
                         🙈
                       </button>
                       <input 
                         placeholder="Item Name"
                         value={part.label}
                         onChange={(e) => handleUpdatePart(index, 'label', e.target.value)}
                         className={`flex-[2] p-2.5 rounded-xl font-medium text-xs outline-none border ${part.isUncounted ? 'line-through' : ''} ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 focus:border-zinc-300'}`}
                       />
                       <input 
                         type="number"
                         placeholder="0.00"
                         value={String(part.amount) === '0' ? '' : part.amount}
                         onChange={(e) => handleUpdatePart(index, 'amount', e.target.value)}
                         className={`flex-1 p-2.5 rounded-xl font-bold text-xs outline-none border text-right ${part.isUncounted ? 'line-through' : ''} ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 focus:border-zinc-300'}`}
                       />
                       <button 
                         onClick={() => handleRemovePart(index)}
                         className="p-2 text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"/></svg>
                       </button>
                     </div>
                   ))}
                   {(editForm.expenseParts || []).length === 0 && (
                     <div className="text-center py-4 border-2 border-dashed rounded-xl opacity-30">
                       <p className="text-[10px] font-black uppercase">No breakdown added</p>
                     </div>
                   )}
                 </div>
               </div>
             </div>

             <div className="mt-8 flex gap-3">
               <button onClick={() => setEditingItemId(null)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-xs tracking-widest ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                 Cancel
               </button>
               <button onClick={handleSaveExpense} className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest shadow-xl">
                 Save Changes
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budget;
