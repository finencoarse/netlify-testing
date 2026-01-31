
import React, { useState, useMemo } from 'react';
import { Trip, Language, ItineraryItem, ExpensePart, StandaloneExpense } from '../types';
import { translations } from '../translations';
import { GeminiService } from '../services/geminiService';

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
  const [editingItemType, setEditingItemType] = useState<'event' | 'flight' | 'expense'>('event');
  
  // Extra state to track which specific flight we are editing (if it's a flight)
  const [editingFlightContext, setEditingFlightContext] = useState<{ type: 'departure' | 'return' | 'complex', index?: number, date?: string } | null>(null);
  
  // State for adding/editing standalone expenses
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [newExpenseForm, setNewExpenseForm] = useState<{
    title: string;
    amountInput: string;
    category: 'eating' | 'shopping' | 'sightseeing' | 'transport' | 'other';
    date: string;
  }>({ title: '', amountInput: '', category: 'other', date: '' });

  // Edit Form State for Expenses (Events/Flights)
  const [editForm, setEditForm] = useState<{
    actualInput: string;
    estimatedInput: string;
    expenseParts: ExpensePart[];
  }>({ actualInput: '0', estimatedInput: '0', expenseParts: [] });

  const [isSaving, setIsSaving] = useState(false);

  // Budget Editing State
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState('');

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // Consolidated Item Type for List
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
    originalItem?: ItineraryItem; // Reference to original event if itemType is event
    expenseParts?: ExpensePart[];
  }

  const allItems = useMemo(() => {
    if (!selectedTrip) return [];
    const items: BudgetItem[] = [];

    // 1. Itinerary Events
    Object.entries(selectedTrip.itinerary).forEach(([date, itineraryItems]) => {
        (itineraryItems as ItineraryItem[]).forEach(i => {
            items.push({
                id: i.id,
                title: i.title,
                date: date,
                type: i.type,
                estimatedExpense: i.estimatedExpense || 0,
                actualExpense: i.actualExpense || 0,
                currency: selectedTrip.defaultCurrency || 'HKD',
                itemType: 'event',
                originalItem: i,
                expenseParts: i.expenseParts
            });
        });
    });

    // 2. Departure Flight
    if (selectedTrip.departureFlight) {
        items.push({
            id: 'flight-dep',
            title: `Flight: ${selectedTrip.departureFlight.code}`,
            date: selectedTrip.startDate,
            type: 'transport',
            estimatedExpense: selectedTrip.departureFlight.price || 0,
            actualExpense: selectedTrip.departureFlight.actualPrice || 0,
            currency: selectedTrip.defaultCurrency || 'HKD',
            itemType: 'flight',
            flightType: 'departure'
        });
    }

    // 3. Return Flight
    if (selectedTrip.returnFlight) {
        items.push({
            id: 'flight-ret',
            title: `Flight: ${selectedTrip.returnFlight.code}`,
            date: selectedTrip.endDate,
            type: 'transport',
            estimatedExpense: selectedTrip.returnFlight.price || 0,
            actualExpense: selectedTrip.returnFlight.actualPrice || 0,
            currency: selectedTrip.defaultCurrency || 'HKD',
            itemType: 'flight',
            flightType: 'return'
        });
    }

    // 4. Complex Flights
    if (selectedTrip.flights) {
        Object.entries(selectedTrip.flights).forEach(([date, flightList]) => {
            (flightList as any[]).forEach((f, idx) => {
                items.push({
                    id: `flight-complex-${date}-${idx}`,
                    title: `Flight: ${f.code}`,
                    date: date,
                    type: 'transport',
                    estimatedExpense: f.price || 0,
                    actualExpense: f.actualPrice || 0,
                    currency: selectedTrip.defaultCurrency || 'HKD',
                    itemType: 'flight',
                    flightType: 'complex',
                    flightIndex: idx
                });
            });
        });
    }

    // 5. Standalone Expenses
    if (selectedTrip.expenses) {
        selectedTrip.expenses.forEach(e => {
            items.push({
                id: e.id,
                title: e.title,
                date: e.date || 'Unspecified',
                type: e.category,
                estimatedExpense: 0, // Standalone typically are added as actuals
                actualExpense: e.amount,
                currency: e.currency,
                itemType: 'expense'
            });
        });
    }

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedTrip]);

  const stats = useMemo(() => {
    if (!selectedTrip) return { totalBudget: 0, totalSpent: 0, totalEstimated: 0 };
    
    let totalSpent = 0;
    let totalEstimated = 0;
    
    allItems.forEach(item => {
      totalSpent += item.actualExpense || 0;
      totalEstimated += item.estimatedExpense || 0;
    });

    return {
      totalBudget: selectedTrip.budget || 0,
      totalSpent,
      totalEstimated
    };
  }, [selectedTrip, allItems]);

  const categoryStats = useMemo(() => {
    if (!selectedTrip) return [];
    
    const cats: Record<string, number> = { eating: 0, shopping: 0, transport: 0, sightseeing: 0, other: 0 };
    let total = 0;

    allItems.forEach(item => {
        const amt = item.actualExpense || 0;
        if (amt > 0) {
            const cat = (['eating', 'shopping', 'transport', 'sightseeing'].includes(item.type) ? item.type : 'other') as keyof typeof cats;
            cats[cat] += amt;
            total += amt;
        }
    });

    return Object.entries(cats)
        .map(([key, value]) => ({ key, value, percent: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value); // Sort by highest spend
  }, [allItems]);

  const handleEditItem = (item: BudgetItem) => {
    setEditingItemId(item.id);
    setEditingItemType(item.itemType);
    
    if (item.itemType === 'flight') {
        setEditingFlightContext({
            type: item.flightType as any,
            index: item.flightIndex,
            date: item.date
        });
    } else {
        setEditingFlightContext(null);
    }

    setEditForm({
      actualInput: item.actualExpense ? String(item.actualExpense) : '',
      estimatedInput: item.estimatedExpense ? String(item.estimatedExpense) : '',
      expenseParts: item.expenseParts ? JSON.parse(JSON.stringify(item.expenseParts)) : []
    });
  };

  const parseAndConvert = async (input: string): Promise<number> => {
    const clean = input.trim();
    if (!clean) return 0;
    
    // Check for currency code pattern (e.g. USD 100, JPY 5000, 100 EUR)
    // Matches CODE NUMBER or NUMBER CODE
    const codeFirstMatch = clean.match(/^([A-Za-z]{3})\s*(\d+(\.\d+)?)$/i);
    const numFirstMatch = clean.match(/^(\d+(\.\d+)?)\s*([A-Za-z]{3})$/i);

    let currency = '';
    let amount = 0;

    if (codeFirstMatch) {
      currency = codeFirstMatch[1].toUpperCase();
      amount = parseFloat(codeFirstMatch[2]);
    } else if (numFirstMatch) {
      amount = parseFloat(numFirstMatch[1]);
      currency = numFirstMatch[3].toUpperCase();
    } else {
      // Assume number is HKD
      return parseFloat(clean) || 0;
    }

    if (currency === 'HKD') return amount;

    try {
      const rate = await GeminiService.getExchangeRate(currency, 'HKD');
      return rate ? Number((amount * rate).toFixed(2)) : amount;
    } catch (e) {
      console.error(`Failed to convert ${currency} to HKD`, e);
      return amount;
    }
  };

  const handleStartEditBudget = () => {
    if (selectedTrip) {
      setTempBudget(selectedTrip.budget ? String(selectedTrip.budget) : '');
      setIsEditingBudget(true);
    }
  };

  const handleSaveBudget = async () => {
    if (selectedTrip) {
      const newBudget = await parseAndConvert(tempBudget);
      onUpdateTrip({ ...selectedTrip, budget: newBudget });
      setIsEditingBudget(false);
    }
  };

  const handleSaveExpense = async () => {
    if (!selectedTrip || !editingItemId) return;
    setIsSaving(true);
    
    try {
      // Convert main inputs
      const finalActualMain = await parseAndConvert(editForm.actualInput);
      const finalEstimated = await parseAndConvert(editForm.estimatedInput);

      // Process parts if they exist
      let finalParts: ExpensePart[] = [];
      let partsSum = 0;

      if (editForm.expenseParts.length > 0) {
        finalParts = await Promise.all(editForm.expenseParts.map(async (part: any) => {
           // If part.amount is a string from input (we will change input type below), convert it
           const val = await parseAndConvert(String(part.amount));
           return {
             ...part,
             amount: val
           };
        }));

        partsSum = finalParts.reduce((acc, part) => acc + (part.isUncounted ? 0 : part.amount), 0);
      }

      // If parts exist, Actual = Sum of parts.
      const finalActual = finalParts.length > 0 ? partsSum : finalActualMain;
      const updatedTrip = { ...selectedTrip };

      if (editingItemType === 'event') {
          // Update Itinerary Item
          const newItinerary = { ...updatedTrip.itinerary };
          for (const date in newItinerary) {
            newItinerary[date] = newItinerary[date].map(item => {
              if (item.id === editingItemId) {
                return {
                  ...item,
                  actualExpense: finalActual,
                  estimatedExpense: finalEstimated,
                  expenseParts: finalParts,
                  currency: 'HKD' 
                };
              }
              return item;
            });
          }
          updatedTrip.itinerary = newItinerary;

      } else if (editingItemType === 'flight' && editingFlightContext) {
          // Update Flight Item
          if (editingFlightContext.type === 'departure' && updatedTrip.departureFlight) {
              updatedTrip.departureFlight = {
                  ...updatedTrip.departureFlight,
                  price: finalEstimated,
                  actualPrice: finalActual
              };
          } else if (editingFlightContext.type === 'return' && updatedTrip.returnFlight) {
              updatedTrip.returnFlight = {
                  ...updatedTrip.returnFlight,
                  price: finalEstimated,
                  actualPrice: finalActual
              };
          } else if (editingFlightContext.type === 'complex' && updatedTrip.flights && editingFlightContext.date && editingFlightContext.index !== undefined) {
              const list = [...(updatedTrip.flights[editingFlightContext.date] || [])];
              if (list[editingFlightContext.index]) {
                  list[editingFlightContext.index] = {
                      ...list[editingFlightContext.index],
                      price: finalEstimated,
                      actualPrice: finalActual
                  };
                  updatedTrip.flights = {
                      ...updatedTrip.flights,
                      [editingFlightContext.date]: list
                  };
              }
          }
      } else if (editingItemType === 'expense') {
          // Edit Standalone Expense
          if (updatedTrip.expenses) {
              updatedTrip.expenses = updatedTrip.expenses.map(e => 
                  e.id === editingItemId ? { ...e, amount: finalActual } : e
              );
          }
      }

      onUpdateTrip(updatedTrip);
      setEditingItemId(null);
    } catch (e) {
      console.error(e);
      alert("Failed to save expense. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewExpense = async () => {
    if (!newExpenseForm.title || !newExpenseForm.amountInput) return;
    setIsSaving(true);
    try {
        const amount = await parseAndConvert(newExpenseForm.amountInput);
        const newExpense: StandaloneExpense = {
            id: `exp-${Date.now()}`,
            title: newExpenseForm.title,
            amount: amount,
            currency: 'HKD',
            category: newExpenseForm.category,
            date: newExpenseForm.date || undefined
        };

        const updatedTrip = { ...selectedTrip! };
        updatedTrip.expenses = [...(updatedTrip.expenses || []), newExpense];
        onUpdateTrip(updatedTrip);
        
        setShowAddExpenseModal(false);
        setNewExpenseForm({ title: '', amountInput: '', category: 'other', date: '' });
    } catch (e) {
        console.error(e);
        alert("Error adding expense");
    } finally {
        setIsSaving(false);
    }
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
             <div className={`p-6 rounded-[2.5rem] border relative group ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="flex justify-between items-start">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.totalBudget}</div>
                  {!isEditingBudget && (
                    <button 
                      onClick={handleStartEditBudget}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
                    >
                      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                  )}
                </div>
                {isEditingBudget ? (
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={tempBudget} 
                      onChange={(e) => setTempBudget(e.target.value)}
                      placeholder="Amount"
                      className={`w-full p-2 rounded-lg font-black text-xl outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-700' : 'bg-white border-zinc-200'}`}
                      autoFocus
                    />
                    <button onClick={handleSaveBudget} className="p-2 bg-emerald-500 text-white rounded-lg hover:scale-105 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></button>
                    <button onClick={() => setIsEditingBudget(false)} className="p-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 rounded-lg hover:scale-105 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
                  </div>
                ) : (
                  <div className="text-3xl font-black">HKD {stats.totalBudget.toLocaleString()}</div>
                )}
             </div>
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.totalSpent}</div>
                <div className={`text-3xl font-black ${stats.totalSpent > stats.totalBudget ? 'text-rose-500' : 'text-emerald-500'}`}>
                  HKD {stats.totalSpent.toLocaleString()}
                </div>
             </div>
             <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.remaining}</div>
                <div className="text-3xl font-black">HKD {(stats.totalBudget - stats.totalSpent).toLocaleString()}</div>
             </div>
          </div>

          {/* Analysis Section */}
          <div className={`p-6 rounded-[2.5rem] border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}>
             <h3 className="text-xl font-black mb-6">Spending Analysis</h3>
             {categoryStats.length > 0 ? (
               <div className="space-y-4">
                 {categoryStats.map(stat => (
                   <div key={stat.key} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                         <span className="flex items-center gap-2">
                           {stat.key === 'eating' && '🍱'}
                           {stat.key === 'shopping' && '🛍️'}
                           {stat.key === 'transport' && '🚗'}
                           {stat.key === 'sightseeing' && '🏛️'}
                           {stat.key === 'other' && '✨'}
                           {stat.key}
                         </span>
                         <span>{stat.percent.toFixed(1)}% (HKD {stat.value.toLocaleString()})</span>
                      </div>
                      <div className={`h-2.5 w-full rounded-full overflow-hidden ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                         <div 
                           className="h-full rounded-full transition-all duration-1000 bg-indigo-500"
                           style={{ width: `${stat.percent}%` }}
                         />
                      </div>
                   </div>
                 ))}
               </div>
             ) : (
                <div className="text-center py-8 opacity-40 font-bold text-sm">No expenses recorded yet.</div>
             )}
          </div>

          {/* Add Expense Button */}
          <div className="flex justify-center">
             <button 
               onClick={() => setShowAddExpenseModal(true)}
               className="bg-black dark:bg-white text-white dark:text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
             >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
               Add Standalone Expense
             </button>
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
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${item.itemType === 'flight' ? 'bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400' : (item.itemType === 'expense' ? 'bg-purple-100 text-purple-500 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-zinc-100 dark:bg-zinc-800')}`}>
                           {item.itemType === 'flight' ? '✈️' : (item.type === 'eating' ? '🍱' : item.type === 'shopping' ? '🛍️' : item.type === 'transport' ? '🚗' : item.type === 'sightseeing' ? '🏛️' : '✨')}
                        </div>
                        <div>
                           <div className="font-bold flex items-center gap-2">
                             {item.title}
                             {item.itemType === 'expense' && <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 text-[8px] font-black uppercase tracking-wider">Extra</span>}
                           </div>
                           <div className="text-xs opacity-50">{item.date} {item.itemType === 'flight' && <span className="ml-1 px-1 rounded bg-zinc-200 dark:bg-zinc-700 text-[9px] font-black uppercase">Flight</span>}</div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="font-black text-lg">HKD {item.actualExpense.toLocaleString()}</div>
                        {item.itemType !== 'expense' && <div className="text-[10px] opacity-40 uppercase font-bold tracking-widest">Est: {item.estimatedExpense.toLocaleString()}</div>}
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 opacity-50">No trips available.</div>
      )}

      {/* Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddExpenseModal(false)} />
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">New Expense</h3>
             <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.eventName}</label>
                   <input 
                     value={newExpenseForm.title} 
                     onChange={e => setNewExpenseForm({...newExpenseForm, title: e.target.value})} 
                     placeholder="e.g. Extra Train Ticket"
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Amount (HKD or Code)</label>
                   <input 
                     value={newExpenseForm.amountInput} 
                     onChange={e => setNewExpenseForm({...newExpenseForm, amountInput: e.target.value})} 
                     placeholder="e.g. 500 or USD 50"
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.category}</label>
                   <select 
                     value={newExpenseForm.category}
                     onChange={e => setNewExpenseForm({...newExpenseForm, category: e.target.value as any})}
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 appearance-none ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   >
                     <option value="eating">🍱 Eating</option>
                     <option value="shopping">🛍️ Shopping</option>
                     <option value="sightseeing">🏛️ Sightseeing</option>
                     <option value="transport">🚗 Transport</option>
                     <option value="other">✨ Other</option>
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.time}</label>
                   <input 
                     type="date"
                     value={newExpenseForm.date} 
                     onChange={e => setNewExpenseForm({...newExpenseForm, date: e.target.value})} 
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`} 
                   />
                </div>
                <div className="pt-4 flex gap-3">
                   <button onClick={() => setShowAddExpenseModal(false)} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800">{t.cancel}</button>
                   <button onClick={handleAddNewExpense} disabled={isSaving} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-indigo-600 text-white shadow-lg disabled:opacity-70">{isSaving ? 'Saving...' : t.save}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Edit Modal (Existing) */}
      {editingItemId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSaving && setEditingItemId(null)} />
          <div className={`relative w-full max-w-md p-6 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
             <h3 className="text-2xl font-black mb-6">Edit Expense</h3>
             
             <div className="space-y-6">
               <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold leading-relaxed border-2 border-indigo-100 dark:border-indigo-900/30">
                  💡 Tip: Enter any currency code to auto-convert to HKD! (e.g. "USD 50" or "JPY 1000")
               </div>

               {/* Main Cost Inputs */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.actualCost} (HKD)</label>
                   <input 
                     type="text"
                     placeholder="0"
                     value={editForm.actualInput}
                     onChange={(e) => setEditForm({ ...editForm, actualInput: e.target.value })}
                     className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                   />
                 </div>
                 {editingItemType !== 'expense' && (
                   <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-50">{t.estimated} (HKD)</label>
                     <input 
                       type="text"
                       placeholder="0"
                       value={editForm.estimatedInput}
                       onChange={(e) => setEditForm({ ...editForm, estimatedInput: e.target.value })}
                       className={`w-full p-3 rounded-xl font-bold outline-none border-2 ${darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
                     />
                   </div>
                 )}
               </div>

               {/* Sub-Expenses List (Only for Events) */}
               {editingItemType === 'event' && (
                 <div className="space-y-4">
                    <div className="flex justify-between items-center border-t pt-4 border-dashed border-gray-300 dark:border-gray-700">
                       <h4 className="font-black text-sm uppercase tracking-widest">Split Items</h4>
                       <button onClick={handleAddPart} className="text-xs font-bold text-indigo-500 hover:text-indigo-600">+ Add Item</button>
                    </div>
                    {editForm.expenseParts.length > 0 ? (
                      <div className="space-y-2">
                        {editForm.expenseParts.map((part, index) => (
                          <div key={index} className="flex gap-2 items-center">
                             <input 
                               value={part.label} 
                               onChange={e => handleUpdatePart(index, 'label', e.target.value)} 
                               placeholder="Item Name" 
                               className={`flex-1 p-2 rounded-lg text-xs font-bold border ${darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`} 
                             />
                             <input 
                               type="text"
                               value={part.amount} 
                               onChange={e => handleUpdatePart(index, 'amount', e.target.value)} 
                               placeholder="Amt" 
                               className={`w-20 p-2 rounded-lg text-xs font-bold border ${darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`} 
                             />
                             <button onClick={() => handleRemovePart(index)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                             </button>
                          </div>
                        ))}
                        <p className="text-[10px] opacity-50 text-right">Sum of items will overwrite Actual Cost.</p>
                      </div>
                    ) : (
                      <p className="text-center text-xs opacity-40 italic">No split items added.</p>
                    )}
                 </div>
               )}

               <div className="flex gap-3 pt-4">
                  <button onClick={() => setEditingItemId(null)} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800">{t.cancel}</button>
                  <button onClick={handleSaveExpense} disabled={isSaving} className="flex-1 py-3 font-black uppercase text-xs rounded-xl bg-indigo-600 text-white shadow-lg disabled:opacity-70">{isSaving ? 'Saving...' : t.save}</button>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budget;
