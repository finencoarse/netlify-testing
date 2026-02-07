
import React, { useState, useMemo, useEffect } from 'react';
import { Trip, Language, ItineraryItem, ExpensePart, StandaloneExpense, UserProfile, FlightInfo } from '../types';
import { translations } from '../translations';
import { ExchangeRateService } from '../services/exchangeRateService';
import { COUNTRIES } from '../data/countries';

interface BudgetProps {
  trips: Trip[];
  language: Language;
  darkMode: boolean;
  onUpdateTrip: (trip: Trip) => void;
  userProfile: UserProfile;
}

interface BudgetItem {
  id: string;
  title: string;
  date: string;
  type: string;
  estimatedExpense: number;
  actualExpense: number;
  currency: string;
  itemType: 'event' | 'flight' | 'expense';
  flightType?: 'departure' | 'return' | 'complex';
  flightIndex?: number;
  originalItem?: ItineraryItem | StandaloneExpense;
  expenseParts?: ExpensePart[];
}

const Budget: React.FC<BudgetProps> = ({ trips, language, darkMode, onUpdateTrip, userProfile }) => {
  const t = translations[language];
  const [selectedTripId, setSelectedTripId] = useState<string | null>(trips.length > 0 ? trips[0].id : null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingFlightContext, setEditingFlightContext] = useState<{ type: 'departure' | 'return' | 'complex', index?: number, date?: string } | null>(null);
  
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  
  // New Expense Form State
  const [newExpenseTitle, setNewExpenseTitle] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<'eating' | 'shopping' | 'sightseeing' | 'transport' | 'other'>('other');
  const [newExpenseDate, setNewExpenseDate] = useState('');
  
  // Converter State (Add Modal)
  const [sourceAmount, setSourceAmount] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('USD');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetCurrency, setTargetCurrency] = useState('USD');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  // Converter State (Edit Modal)
  const [editSourceAmount, setEditSourceAmount] = useState('');
  const [editSourceCurrency, setEditSourceCurrency] = useState('USD');
  const [editExchangeRate, setEditExchangeRate] = useState<number | null>(null);
  const [isFetchingEditRate, setIsFetchingEditRate] = useState(false);

  const [editForm, setEditForm] = useState<{
    actualInput: string;
    estimatedInput: string;
    currency: string;
    expenseParts: ExpensePart[];
  }>({ actualInput: '0', estimatedInput: '0', currency: 'USD', expenseParts: [] });

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState('');

  const selectedTrip = trips.find(t => t.id === selectedTripId) || null;
  const homeCurrency = userProfile?.currency || 'USD';
  
  // Get unique currencies for dropdown
  const currencyOptions = useMemo(() => {
    const set = new Set(COUNTRIES.map(c => c.currency));
    set.add('USD'); set.add('EUR'); set.add('JPY'); set.add('GBP'); set.add('KRW'); set.add('TWD'); set.add('HKD');
    return Array.from(set).sort();
  }, []);

  const handleOpenAddModal = () => {
    setNewExpenseTitle('');
    setNewExpenseCategory('other');
    setNewExpenseDate(selectedTrip?.startDate || new Date().toISOString().split('T')[0]);
    
    // Default Left: User Home Currency
    setSourceAmount('');
    setSourceCurrency(homeCurrency);
    
    // Default Right: Trip Currency
    setTargetAmount('');
    setTargetCurrency(selectedTrip?.defaultCurrency || 'USD');
    
    setExchangeRate(null);
    setShowAddExpenseModal(true);
  };

  // Real-time conversion effect (Add Modal)
  useEffect(() => {
    let active = true;
    const calculate = async () => {
        if (!showAddExpenseModal || !sourceCurrency || !targetCurrency) return;
        if (sourceCurrency === targetCurrency) {
            if (active) {
                setTargetAmount(sourceAmount);
                setExchangeRate(1);
            }
            return;
        }
        setIsFetchingRate(true);
        const rate = await ExchangeRateService.getRate(sourceCurrency, targetCurrency);
        if (active) {
            setExchangeRate(rate);
            setIsFetchingRate(false);
            if (rate && sourceAmount) {
                const val = parseFloat(sourceAmount);
                if (!isNaN(val)) {
                    setTargetAmount((val * rate).toFixed(2));
                } else {
                    setTargetAmount('');
                }
            }
        }
    };
    const timer = setTimeout(calculate, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [sourceAmount, sourceCurrency, targetCurrency, showAddExpenseModal]);

  // Real-time conversion effect (Edit Modal)
  useEffect(() => {
    let active = true;
    const calculateEdit = async () => {
        if (!editingItemId || !editSourceCurrency || !editForm.currency) return;
        
        // Only convert if there is a source amount typed
        if (!editSourceAmount) return;

        if (editSourceCurrency === editForm.currency) {
            if (active) {
                setEditForm(prev => ({ ...prev, actualInput: editSourceAmount }));
                setEditExchangeRate(1);
            }
            return;
        }

        setIsFetchingEditRate(true);
        const rate = await ExchangeRateService.getRate(editSourceCurrency, editForm.currency);
        if (active) {
            setEditExchangeRate(rate);
            setIsFetchingEditRate(false);
            if (rate && editSourceAmount) {
                const val = parseFloat(editSourceAmount);
                if (!isNaN(val)) {
                    setEditForm(prev => ({ ...prev, actualInput: (val * rate).toFixed(2) }));
                }
            }
        }
    };
    const timer = setTimeout(calculateEdit, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [editSourceAmount, editSourceCurrency, editForm.currency, editingItemId]);

  const allItems = useMemo(() => {
    if (!selectedTrip) return [];
    const items: BudgetItem[] = [];
    const defCurrency = selectedTrip.defaultCurrency || 'USD';

    // Itinerary Events
    if (selectedTrip.itinerary) {
      Object.entries(selectedTrip.itinerary).forEach(([date, itineraryItems]) => {
          if (Array.isArray(itineraryItems)) {
            itineraryItems.forEach(i => {
                items.push({
                    id: i.id,
                    title: i.title,
                    date: date,
                    type: i.type,
                    estimatedExpense: i.estimatedExpense || 0,
                    actualExpense: i.actualExpense || 0,
                    currency: i.currency || defCurrency,
                    itemType: 'event',
                    originalItem: i,
                    expenseParts: i.expenseParts
                });
            });
          }
      });
    }

    // Flights
    if (selectedTrip.departureFlight) {
        const f = selectedTrip.departureFlight;
        items.push({
            id: 'flight-dep',
            title: `Flight: ${f.code || 'Dep'} (${f.airport || ''})`,
            date: selectedTrip.startDate,
            type: 'transport',
            estimatedExpense: f.price || 0,
            actualExpense: f.actualPrice || 0,
            currency: defCurrency,
            itemType: 'flight',
            flightType: 'departure'
        });
    }
    if (selectedTrip.returnFlight) {
        const f = selectedTrip.returnFlight;
        items.push({
            id: 'flight-ret',
            title: `Flight: ${f.code || 'Ret'} (${f.airport || ''})`,
            date: selectedTrip.endDate,
            type: 'transport',
            estimatedExpense: f.price || 0,
            actualExpense: f.actualPrice || 0,
            currency: defCurrency,
            itemType: 'flight',
            flightType: 'return'
        });
    }
    if (selectedTrip.flights) {
        Object.entries(selectedTrip.flights).forEach(([date, flights]) => {
            if (Array.isArray(flights)) {
                flights.forEach((f, idx) => {
                    items.push({
                        id: `flight-complex-${date}-${idx}`,
                        title: `Flight: ${f.code || ''} (${f.airport || ''})`,
                        date: date,
                        type: 'transport',
                        estimatedExpense: f.price || 0,
                        actualExpense: f.actualPrice || 0,
                        currency: defCurrency,
                        itemType: 'flight',
                        flightType: 'complex',
                        flightIndex: idx
                    });
                });
            }
        });
    }

    // Standalone Expenses
    if (selectedTrip.expenses && Array.isArray(selectedTrip.expenses)) {
        selectedTrip.expenses.forEach(e => {
            items.push({
                id: e.id,
                title: e.title,
                date: e.date || selectedTrip.startDate,
                type: e.category,
                estimatedExpense: e.amount,
                actualExpense: e.amount,
                currency: e.currency,
                itemType: 'expense',
                originalItem: e
            });
        });
    }

    return items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [selectedTrip]);

  const totalSpent = useMemo(() => {
    return allItems.reduce((sum, item) => sum + item.actualExpense, 0);
  }, [allItems]);

  const remainingBudget = (selectedTrip?.budget || 0) - totalSpent;

  const handleEditItem = (item: BudgetItem) => {
    setEditingItemId(item.id);
    if (item.itemType === 'flight') {
        setEditingFlightContext({ type: item.flightType!, index: item.flightIndex, date: item.date });
    } else {
        setEditingFlightContext(null);
    }
    setEditForm({
        actualInput: item.actualExpense.toString(),
        estimatedInput: item.estimatedExpense.toString(),
        currency: item.currency,
        expenseParts: item.expenseParts ? [...item.expenseParts] : []
    });
    
    // Initialize Edit Converter State
    setEditSourceCurrency(homeCurrency);
    setEditSourceAmount('');
    setEditExchangeRate(null);
  };

  const handleSaveItem = () => {
    if (!selectedTrip || !editingItemId) return;
    const actual = parseFloat(editForm.actualInput) || 0;
    const estimated = parseFloat(editForm.estimatedInput) || 0;
    const parts = editForm.expenseParts;
    const updatedTrip = { ...selectedTrip };
    const itemInList = allItems.find(i => i.id === editingItemId);
    if (!itemInList) return;

    if (itemInList.itemType === 'event') {
        const date = itemInList.date;
        const list = updatedTrip.itinerary[date] || [];
        updatedTrip.itinerary[date] = list.map(i => {
            if (i.id === editingItemId) {
                return { ...i, actualExpense: actual, estimatedExpense: estimated, currency: editForm.currency, expenseParts: parts };
            }
            return i;
        });
    } else if (itemInList.itemType === 'flight' && editingFlightContext) {
        const updateFlightObj = (f: FlightInfo) => ({ ...f, price: estimated, actualPrice: actual }); 
        if (editingFlightContext.type === 'departure' && updatedTrip.departureFlight) updatedTrip.departureFlight = updateFlightObj(updatedTrip.departureFlight);
        else if (editingFlightContext.type === 'return' && updatedTrip.returnFlight) updatedTrip.returnFlight = updateFlightObj(updatedTrip.returnFlight);
        else if (editingFlightContext.type === 'complex' && updatedTrip.flights) {
            const date = editingFlightContext.date!;
            const idx = editingFlightContext.index!;
            if (updatedTrip.flights[date] && updatedTrip.flights[date][idx]) updatedTrip.flights[date][idx] = updateFlightObj(updatedTrip.flights[date][idx]);
        }
    } else if (itemInList.itemType === 'expense') {
        if (updatedTrip.expenses) {
            updatedTrip.expenses = updatedTrip.expenses.map(e => e.id === editingItemId ? { ...e, amount: actual, currency: editForm.currency } : e);
        }
    }
    onUpdateTrip(updatedTrip);
    setEditingItemId(null);
    setEditingFlightContext(null);
  };

  const handleAddStandaloneExpense = () => {
    if (!selectedTrip || !newExpenseTitle || !targetAmount) return;
    
    const finalAmount = parseFloat(targetAmount) || 0;
    
    const newExpense: StandaloneExpense = {
        id: `exp-${Date.now()}`,
        title: newExpenseTitle,
        amount: finalAmount,
        currency: targetCurrency, // Use the currency from the Right block
        category: newExpenseCategory,
        date: newExpenseDate || selectedTrip.startDate,
        notes: sourceCurrency !== targetCurrency ? `Converted from ${sourceAmount} ${sourceCurrency}` : ''
    };

    const updatedTrip = { ...selectedTrip, expenses: [...(selectedTrip.expenses || []), newExpense] };
    onUpdateTrip(updatedTrip);
    setShowAddExpenseModal(false);
  };

  const handleUpdateBudget = () => {
    if (!selectedTrip) return;
    const newBudget = parseInt(tempBudget) || 0;
    onUpdateTrip({ ...selectedTrip, budget: newBudget });
    setIsEditingBudget(false);
  };

  const handleDeleteItem = (item: BudgetItem) => {
      if (!selectedTrip || !confirm("Delete this expense record?")) return;
      const updatedTrip = { ...selectedTrip };
      if (item.itemType === 'expense') {
          updatedTrip.expenses = (updatedTrip.expenses || []).filter(e => e.id !== item.id);
          onUpdateTrip(updatedTrip);
          setEditingItemId(null);
      } else {
          alert("Please delete events or flights from the Planner or Trip Details view.");
      }
  };

  const getIcon = (type: string) => {
      if (type === 'eating') return '🍱';
      if (type === 'shopping') return '🛍️';
      if (type === 'sightseeing') return '🏛️';
      if (type === 'transport') return '🚗';
      if (type === 'hotel') return '🏨';
      return '✨';
  };

  if (!selectedTrip) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
              <p className="text-zinc-400 font-bold">No trips available.</p>
          </div>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Home Currency Header */}
      <div className={`flex justify-between items-center p-4 rounded-2xl border-2 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
         <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest opacity-50">Home Currency:</span>
            <div className="flex items-center gap-2">
               <span className="font-black text-lg">{homeCurrency}</span>
               <div className="text-[10px] opacity-40">(Set in Profile)</div>
            </div>
         </div>
         <div className="relative">
            <select 
              value={selectedTripId || ''} 
              onChange={(e) => setSelectedTripId(e.target.value)}
              className={`appearance-none pl-4 pr-10 py-2 rounded-xl font-bold text-xs outline-none border transition-all cursor-pointer ${darkMode ? 'bg-black border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-200 text-black'}`}
            >
                {trips.map(trip => (
                    <option key={trip.id} value={trip.id}>{trip.title}</option>
                ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
            </div>
         </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className={`p-6 rounded-[2rem] border-2 flex flex-col justify-between h-32 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
            <div className="flex justify-between items-start">
               <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.totalBudget}</span>
               <button onClick={() => { setTempBudget(selectedTrip.budget?.toString() || ''); setIsEditingBudget(true); }} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
               </button>
            </div>
            {isEditingBudget ? (
               <div className="flex gap-2">
                  <input autoFocus type="number" value={tempBudget} onChange={e => setTempBudget(e.target.value)} className="w-full bg-transparent font-mono text-2xl font-black outline-none border-b border-indigo-500" onBlur={handleUpdateBudget} onKeyDown={e => e.key === 'Enter' && handleUpdateBudget()} />
               </div>
            ) : (
               <div className="font-mono text-3xl font-black tracking-tight">{selectedTrip.defaultCurrency} {selectedTrip.budget?.toLocaleString()}</div>
            )}
         </div>
         <div className={`p-6 rounded-[2rem] border-2 flex flex-col justify-between h-32 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.totalSpent}</span>
            <div className="font-mono text-3xl font-black tracking-tight text-indigo-500">{selectedTrip.defaultCurrency} {totalSpent.toLocaleString()}</div>
         </div>
         <div className={`p-6 rounded-[2rem] border-2 flex flex-col justify-between h-32 ${remainingBudget < 0 ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/20 dark:border-rose-900/50' : (darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100')}`}>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.remaining}</span>
            <div className={`font-mono text-3xl font-black tracking-tight ${remainingBudget < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
               {selectedTrip.defaultCurrency} {remainingBudget.toLocaleString()}
            </div>
         </div>
      </div>

      {/* Main List */}
      <div className={`rounded-[2.5rem] border-2 overflow-hidden ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
         <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
            <h3 className="font-black text-lg">{t.itinerary} & {t.spendingDetail}</h3>
            <button onClick={handleOpenAddModal} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform">+ Expense</button>
         </div>
         <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {allItems.map(item => (
               <div key={item.id} onClick={() => handleEditItem(item)} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                        item.type === 'eating' ? 'bg-orange-100 text-orange-500' : item.type === 'sightseeing' ? 'bg-blue-100 text-blue-500' : item.type === 'shopping' ? 'bg-pink-100 text-pink-500' : item.type === 'transport' ? 'bg-zinc-100 text-zinc-500' : item.type === 'hotel' ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-500'
                     }`}>{getIcon(item.type)}</div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                           <h4 className="font-bold truncate pr-2">{item.title}</h4>
                           <span className="font-mono font-bold">{item.currency} {item.actualExpense.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs opacity-50 font-medium">
                           <span>{new Date(item.date).toLocaleDateString()} • {item.itemType}</span>
                           <span>Est: {item.estimatedExpense.toLocaleString()}</span>
                        </div>
                     </div>
                  </div>
               </div>
            ))}
            {allItems.length === 0 && <div className="p-12 text-center text-zinc-400 font-bold opacity-50">No expenses recorded yet.</div>}
         </div>
      </div>

      {/* Edit Item Modal */}
      {editingItemId && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingItemId(null)} />
            <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black">{t.editJourney}</h3>
                  <button onClick={() => handleDeleteItem(allItems.find(i => i.id === editingItemId)!)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
               </div>
               <div className="space-y-4">
                  
                  {/* EDIT DUAL BLOCK CONVERTER */}
                  <div className="flex items-center gap-2">
                     {/* LEFT BLOCK: User Source */}
                     <div className={`flex-1 p-3 rounded-2xl border-2 flex flex-col gap-1 transition-colors ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-50">Convert From</label>
                        <input 
                           type="number" 
                           value={editSourceAmount} 
                           onChange={e => setEditSourceAmount(e.target.value)} 
                           placeholder="0"
                           className="w-full bg-transparent font-mono text-xl font-black outline-none"
                        />
                        <div className="relative pt-1 border-t border-dashed border-gray-500/20 mt-1">
                           <select 
                              value={editSourceCurrency} 
                              onChange={e => setEditSourceCurrency(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold appearance-none outline-none cursor-pointer"
                           >
                              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                           <div className="absolute right-0 top-1/2 pt-1 -translate-y-1/2 pointer-events-none opacity-50 text-[8px]">▼</div>
                        </div>
                     </div>

                     {/* ARROW */}
                     <div className="text-zinc-400 dark:text-zinc-600">
                        {isFetchingEditRate ? (
                           <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                        )}
                     </div>

                     {/* RIGHT BLOCK: Trip Target */}
                     <div className={`flex-1 p-3 rounded-2xl border-2 flex flex-col gap-1 transition-colors ${darkMode ? 'bg-indigo-950/20 border-indigo-900/50' : 'bg-indigo-50 border-indigo-100'}`}>
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-50 text-indigo-500">{t.actualCost}</label>
                        <input
                           type="number"
                           value={editForm.actualInput}
                           onChange={e => setEditForm({...editForm, actualInput: e.target.value})}
                           className="w-full bg-transparent font-mono text-xl font-black outline-none text-indigo-600 dark:text-indigo-400"
                        />
                        <div className="relative pt-1 border-t border-dashed border-indigo-500/20 mt-1">
                           <select 
                              value={editForm.currency} 
                              onChange={e => setEditForm({...editForm, currency: e.target.value.toUpperCase()})} 
                              className="w-full bg-transparent text-xs font-bold appearance-none outline-none cursor-pointer text-indigo-600 dark:text-indigo-400"
                           >
                              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                           <div className="absolute right-0 top-1/2 pt-1 -translate-y-1/2 pointer-events-none opacity-50 text-[8px] text-indigo-500">▼</div>
                        </div>
                     </div>
                  </div>

                  {editExchangeRate && (
                     <p className="text-[10px] text-center font-mono opacity-40">
                        1 {editSourceCurrency} ≈ {editExchangeRate.toFixed(4)} {editForm.currency}
                     </p>
                  )}

                  <div className="pt-4 flex gap-3">
                     <button onClick={() => setEditingItemId(null)} className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>{t.cancel}</button>
                     <button onClick={handleSaveItem} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700">{t.save}</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Add Standalone Expense Modal with Dual-Block Layout */}
      {showAddExpenseModal && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddExpenseModal(false)} />
            <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
               <h3 className="text-xl font-black mb-6">Add Extra Expense</h3>
               <div className="space-y-4">
                  <input placeholder="Title (e.g. Taxi)" value={newExpenseTitle} onChange={e => setNewExpenseTitle(e.target.value)} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />
                  
                  {/* DUAL BLOCK CONVERTER */}
                  <div className="flex items-center gap-2">
                     
                     {/* LEFT BLOCK: User Source */}
                     <div className={`flex-1 p-3 rounded-2xl border-2 flex flex-col gap-1 transition-colors ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-50">Amount</label>
                        <input 
                           type="number" 
                           value={sourceAmount} 
                           onChange={e => setSourceAmount(e.target.value)} 
                           placeholder="0"
                           className="w-full bg-transparent font-mono text-xl font-black outline-none"
                        />
                        <div className="relative pt-1 border-t border-dashed border-gray-500/20 mt-1">
                           <select 
                              value={sourceCurrency} 
                              onChange={e => setSourceCurrency(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold appearance-none outline-none cursor-pointer"
                           >
                              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                           <div className="absolute right-0 top-1/2 pt-1 -translate-y-1/2 pointer-events-none opacity-50 text-[8px]">▼</div>
                        </div>
                     </div>

                     {/* ARROW */}
                     <div className="text-zinc-400 dark:text-zinc-600">
                        {isFetchingRate ? (
                           <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                        )}
                     </div>

                     {/* RIGHT BLOCK: Trip Target */}
                     <div className={`flex-1 p-3 rounded-2xl border-2 flex flex-col gap-1 transition-colors ${darkMode ? 'bg-indigo-950/20 border-indigo-900/50' : 'bg-indigo-50 border-indigo-100'}`}>
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-50 text-indigo-500">Converted</label>
                        <div className="font-mono text-xl font-black text-indigo-600 dark:text-indigo-400 truncate h-7">
                           {targetAmount || '---'}
                        </div>
                        <div className="relative pt-1 border-t border-dashed border-indigo-500/20 mt-1">
                           <select 
                              value={targetCurrency} 
                              onChange={e => setTargetCurrency(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold appearance-none outline-none cursor-pointer text-indigo-600 dark:text-indigo-400"
                           >
                              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                           <div className="absolute right-0 top-1/2 pt-1 -translate-y-1/2 pointer-events-none opacity-50 text-[8px] text-indigo-500">▼</div>
                        </div>
                     </div>
                  </div>

                  {exchangeRate && (
                     <p className="text-[10px] text-center font-mono opacity-40">
                        1 {sourceCurrency} ≈ {exchangeRate.toFixed(4)} {targetCurrency}
                     </p>
                  )}

                  <input type="date" value={newExpenseDate} onChange={e => setNewExpenseDate(e.target.value)} className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} />

                  <select value={newExpenseCategory} onChange={e => setNewExpenseCategory(e.target.value as any)} className={`w-full p-3 rounded-xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-black border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                     <option value="eating">Eating</option>
                     <option value="shopping">Shopping</option>
                     <option value="sightseeing">Sightseeing</option>
                     <option value="transport">Transport</option>
                     <option value="other">Other</option>
                  </select>
                  <div className="pt-4 flex gap-3">
                     <button onClick={() => setShowAddExpenseModal(false)} className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>{t.cancel}</button>
                     <button onClick={handleAddStandaloneExpense} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700">{t.save}</button>
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default Budget;
