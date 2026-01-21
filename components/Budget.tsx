
import React, { useState } from 'react';
import { Trip, Language, ItineraryItem, UserProfile, ExpensePart } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';

interface BudgetProps {
  trips: Trip[];
  language: Language;
  darkMode: boolean;
  onUpdateTrip: (trip: Trip) => void;
}

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'United States': 'USD', 'USA': 'USD', 'US': 'USD',
  'United Kingdom': 'GBP', 'UK': 'GBP',
  'Japan': 'JPY',
  'China': 'CNY',
  'Hong Kong': 'HKD',
  'Taiwan': 'TWD',
  'South Korea': 'KRW', 'Korea': 'KRW',
  'Canada': 'CAD',
  'Australia': 'AUD',
  'Europe': 'EUR', 'Germany': 'EUR', 'France': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR',
  'Singapore': 'SGD'
};

const getCurrencyFromProfile = (): string => {
  const savedProfile = localStorage.getItem('wanderlust_profile');
  if (savedProfile) {
    const profile = JSON.parse(savedProfile) as UserProfile;
    if (profile.nationality) {
      return COUNTRY_CURRENCY_MAP[profile.nationality] || 'USD';
    }
  }
  return 'USD';
};

const Budget: React.FC<BudgetProps> = ({ trips, language, darkMode, onUpdateTrip }) => {
  const t = translations[language];
  const homeCurrency = getCurrencyFromProfile();
  
  // Store fetched exchange rates: "FROM_TO_TRIPID" -> { rate, date }
  const [exchangeRateData, setExchangeRateData] = useState<Record<string, { rate: number, date: string }>>({});
  const [loadingRate, setLoadingRate] = useState<string | null>(null);

  // Editor State
  const [editingItem, setEditingItem] = useState<{ tripId: string, date: string, item: ItineraryItem } | null>(null);
  const [editForm, setEditForm] = useState<Partial<ItineraryItem>>({});

  const categories = ['sightseeing', 'eating', 'shopping', 'transport', 'other'] as const;
  const categoryColors = {
    sightseeing: 'bg-indigo-500',
    eating: 'bg-orange-500',
    shopping: 'bg-pink-500',
    transport: 'bg-blue-500',
    other: 'bg-gray-500'
  };

  const handleFetchRate = async (tripId: string, fromCurr: string, dateStr: string) => {
    const key = `${fromCurr}_${homeCurrency}_${tripId}`;
    if (exchangeRateData[key] || loadingRate) return;

    setLoadingRate(tripId);
    try {
      const rate = await GeminiService.getExchangeRate(fromCurr, homeCurrency, dateStr);
      if (rate) {
        setExchangeRateData(prev => ({ 
          ...prev, 
          [key]: { rate, date: dateStr === 'today' ? new Date().toLocaleDateString() : dateStr } 
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRate(null);
    }
  };

  const openEditor = (tripId: string, date: string, item: ItineraryItem) => {
    setEditingItem({ tripId, date, item });
    setEditForm({
      actualExpense: item.actualExpense,
      estimatedExpense: item.estimatedExpense,
      currency: item.currency,
      spendingDescription: item.spendingDescription || '',
      expenseParts: item.expenseParts || []
    });
  };

  const saveExpense = () => {
    if (!editingItem) return;
    const trip = trips.find(t => t.id === editingItem.tripId);
    if (!trip) return;

    const updatedItinerary = { ...trip.itinerary };
    const dayEvents = updatedItinerary[editingItem.date];
    
    if (dayEvents) {
      updatedItinerary[editingItem.date] = dayEvents.map(ev => 
        ev.id === editingItem.item.id ? { ...ev, ...editForm } : ev
      );
      onUpdateTrip({ ...trip, itinerary: updatedItinerary });
    }
    setEditingItem(null);
  };

  const handleAddPart = () => {
    const newParts = [...(editForm.expenseParts || []), { id: Date.now().toString(), label: '', amount: 0 }];
    setEditForm({ ...editForm, expenseParts: newParts });
  };

  const handleRemovePart = (index: number) => {
    const newParts = [...(editForm.expenseParts || [])];
    newParts.splice(index, 1);
    
    // Auto-sum remainder
    const total = newParts.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    setEditForm({ ...editForm, expenseParts: newParts, actualExpense: total > 0 ? total : editForm.actualExpense });
  };

  const handleUpdatePart = (index: number, field: keyof ExpensePart, value: any) => {
    const newParts = [...(editForm.expenseParts || [])];
    newParts[index] = { ...newParts[index], [field]: value };
    
    // Auto-sum on amount change
    let newTotal = editForm.actualExpense;
    if (field === 'amount') {
      newTotal = newParts.reduce((sum, p) => sum + (parseFloat(p.amount as any) || 0), 0);
    }

    setEditForm({ ...editForm, expenseParts: newParts, actualExpense: newTotal });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black tracking-tight">{t.budgetFeature}</h2>
        <div className="flex justify-between items-end">
          <p className="text-zinc-500 font-bold text-sm">{t.budgetIntro}</p>
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Home: {homeCurrency}
          </span>
        </div>
      </div>

      {trips.length === 0 && (
        <div className="text-center py-20 opacity-50">
          <p className="font-bold">No trips planned yet.</p>
        </div>
      )}

      {trips.map(trip => {
        const currency = trip.defaultCurrency || '$';
        
        let totalSpent = 0;
        let totalEstimated = 0;
        const catTotals: Record<string, number> = {};

        // Flatten items for calculation
        const items = (Object.values(trip.itinerary) as ItineraryItem[][]).reduce((acc: ItineraryItem[], val: ItineraryItem[]) => acc.concat(val), []);
        items.forEach(item => {
          if (!item.currency || item.currency === currency) {
            totalSpent += item.actualExpense || 0;
            totalEstimated += item.estimatedExpense || 0;
            catTotals[item.type] = (catTotals[item.type] || 0) + (item.actualExpense || 0);
          }
        });

        const tripBudget = trip.budget || 0;
        const percentUsed = tripBudget > 0 ? (totalSpent / tripBudget) * 100 : 0;
        const remaining = tripBudget - totalSpent;

        // Exchange Rate Logic
        const rateKey = `${currency}_${homeCurrency}_${trip.id}`;
        const rateData = exchangeRateData[rateKey];
        const showConversion = currency !== homeCurrency;

        return (
          <div key={trip.id} className={`p-6 rounded-[2rem] border-2 shadow-xl mb-8 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black">{trip.title}</h3>
                <p className="text-xs font-bold opacity-50 uppercase tracking-widest">{trip.startDate} - {trip.endDate}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${darkMode ? 'bg-black text-zinc-400' : 'bg-zinc-900 text-zinc-400'}`}>
                  <span className="text-[9px] font-black uppercase tracking-widest">Currency</span>
                  <input 
                    value={trip.defaultCurrency || ''}
                    onChange={(e) => onUpdateTrip({...trip, defaultCurrency: e.target.value})}
                    className="w-8 bg-transparent text-white text-center font-black text-sm outline-none placeholder-zinc-600"
                    placeholder="$"
                  />
                </div>
                {showConversion && !rateData && (
                  <button 
                    onClick={() => handleFetchRate(trip.id, currency, trip.status === 'past' ? trip.startDate : 'today')}
                    disabled={loadingRate === trip.id}
                    className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:underline disabled:opacity-50"
                  >
                    {loadingRate === trip.id ? 'Calculating...' : `Convert to ${homeCurrency}`}
                  </button>
                )}
                {rateData && (
                  <div className="text-right">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-500">
                      1 {currency} ≈ {rateData.rate.toFixed(2)} {homeCurrency}
                    </span>
                    <span className="block text-[8px] font-bold text-zinc-500 opacity-60">
                      Rate on: {rateData.date}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">{t.budget}</p>
                <p className="text-2xl font-black">{currency}{tripBudget.toLocaleString()}</p>
                {rateData && <p className="text-xs font-bold opacity-50">≈ {homeCurrency} {(tripBudget * rateData.rate).toLocaleString(undefined, {maximumFractionDigits: 0})}</p>}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">{t.totalSpent}</p>
                <p className={`text-2xl font-black ${totalSpent > tripBudget ? 'text-rose-500' : 'text-emerald-500'}`}>{currency}{totalSpent.toLocaleString()}</p>
                {rateData && <p className="text-xs font-bold opacity-50">≈ {homeCurrency} {(totalSpent * rateData.rate).toLocaleString(undefined, {maximumFractionDigits: 0})}</p>}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">{t.estimated}</p>
                <p className="text-xl font-black opacity-70">{currency}{totalEstimated.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">{t.remaining}</p>
                <p className={`text-xl font-black ${remaining < 0 ? 'text-rose-500' : ''}`}>{currency}{remaining.toLocaleString()}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`absolute top-0 left-0 h-full transition-all duration-1000 rounded-full ${totalSpent > tripBudget ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                style={{ width: `${Math.min(percentUsed, 100)}%` }} 
              />
            </div>
            <div className="flex justify-between mt-2 mb-6">
              <span className="text-[10px] font-bold opacity-50">0%</span>
              <span className="text-[10px] font-bold opacity-50">100%</span>
            </div>

            {/* Category Breakdown Bar */}
            <div className="space-y-2 mb-8">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.byCategory}</p>
              <div className="flex h-6 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {categories.map(cat => {
                  const amount = catTotals[cat] || 0;
                  if (amount === 0) return null;
                  const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
                  return (
                    <div key={cat} className={`${categoryColors[cat]} transition-all duration-500`} style={{ width: `${pct}%` }} title={`${cat}: ${currency}${amount}`} />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {categories.map(cat => (
                  catTotals[cat] > 0 && (
                    <div key={cat} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${categoryColors[cat]}`} />
                      <span className="text-[10px] font-bold uppercase">{cat}</span>
                      <span className="text-[10px] opacity-60">({Math.round((catTotals[cat]/totalSpent)*100)}%)</span>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* EXPENSE LIST & EDITOR */}
            <div className="space-y-4 border-t border-zinc-100 dark:border-zinc-800 pt-6">
               <h4 className="text-sm font-black uppercase tracking-widest opacity-70">Expense Detail Editor</h4>
               
               <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                 {Object.entries(trip.itinerary).sort().map(([date, dayItems]) => {
                   const items = dayItems as ItineraryItem[];
                   const relevantItems = items.filter(i => i.estimatedExpense > 0 || i.actualExpense > 0);
                   if (relevantItems.length === 0) return null;

                   return (
                     <div key={date} className="space-y-2">
                       <h5 className="text-[10px] font-black uppercase tracking-widest opacity-50 sticky top-0 bg-white dark:bg-zinc-900 py-2 z-10">{date}</h5>
                       {relevantItems.map(item => (
                         <div 
                           key={item.id} 
                           onClick={() => openEditor(trip.id, date, item)}
                           className={`group p-4 rounded-2xl border-2 transition-all cursor-pointer ${darkMode ? 'border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700' : 'border-zinc-50 hover:bg-zinc-50 hover:border-zinc-200'}`}
                         >
                           <div className="flex justify-between items-start">
                             <div className="flex items-center gap-3">
                               <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                                  item.type === 'eating' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 
                                  item.type === 'transport' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 
                                  item.type === 'shopping' ? 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' : 
                                  'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                }`}>
                                  {item.type === 'eating' ? '🍱' : item.type === 'transport' ? '🚆' : item.type === 'shopping' ? '🛍️' : '🏛️'}
                                </div>
                                <div>
                                  <p className="font-bold text-sm leading-tight group-hover:text-indigo-500 transition-colors">{item.title}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] opacity-60">{item.spendingDescription || "No details provided"}</p>
                                    {item.expenseParts && item.expenseParts.length > 0 && (
                                       <span className="text-[9px] font-black bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full text-zinc-600 dark:text-zinc-300">
                                         {item.expenseParts.length} Parts
                                       </span>
                                    )}
                                  </div>
                                </div>
                             </div>
                             <div className="text-right">
                               <p className={`text-sm font-black ${item.actualExpense > item.estimatedExpense ? 'text-rose-500' : 'text-emerald-500'}`}>
                                 {item.currency}{item.actualExpense}
                               </p>
                               <p className="text-[9px] font-bold opacity-40">Est: {item.currency}{item.estimatedExpense}</p>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                   );
                 })}
               </div>
            </div>

          </div>
        );
      })}

      {/* EXPENSE EDITOR MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingItem(null)} />
          <div className={`relative w-full max-w-sm max-h-[85vh] flex flex-col p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <div className="flex justify-between items-center mb-6 flex-shrink-0">
               <h3 className="text-xl font-black">{t.spendingDetail}</h3>
               <button onClick={() => setEditingItem(null)} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
               </button>
             </div>

             <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pb-4">
               <div>
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">{t.eventName}</p>
                 <p className="font-bold text-lg">{editingItem.item.title}</p>
               </div>

               {/* Main Cost Inputs */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.actualCost}</label>
                   <input 
                     type="number"
                     value={editForm.actualExpense}
                     onChange={(e) => setEditForm({ ...editForm, actualExpense: parseFloat(e.target.value) || 0 })}
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated}</label>
                   <input 
                     type="number"
                     value={editForm.estimatedExpense}
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
                     <div key={part.id} className="flex gap-2 items-center animate-in slide-in-from-left-2">
                       <input 
                         placeholder="Item Name"
                         value={part.label}
                         onChange={(e) => handleUpdatePart(index, 'label', e.target.value)}
                         className={`flex-[2] p-2.5 rounded-xl font-medium text-xs outline-none border ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 focus:border-zinc-300'}`}
                       />
                       <input 
                         type="number"
                         placeholder="0.00"
                         value={part.amount}
                         onChange={(e) => handleUpdatePart(index, 'amount', e.target.value)}
                         className={`flex-1 p-2.5 rounded-xl font-bold text-xs outline-none border text-right ${darkMode ? 'bg-zinc-950 border-zinc-800 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 focus:border-zinc-300'}`}
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

               <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.currency}</label>
                 <input 
                    value={editForm.currency}
                    onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                    className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                 />
               </div>

               <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.briefDescription} / Notes</label>
                 <textarea 
                    rows={2}
                    value={editForm.spendingDescription}
                    onChange={(e) => setEditForm({ ...editForm, spendingDescription: e.target.value })}
                    placeholder="E.g. Paid via Credit Card..."
                    className={`w-full p-3 rounded-xl font-bold outline-none border-2 resize-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                 />
               </div>
             </div>

             <div className="pt-4 flex-shrink-0">
               <button 
                 onClick={saveExpense}
                 className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl"
               >
                 {t.save}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budget;
