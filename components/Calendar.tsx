
import React, { useState, useMemo, useRef } from 'react';
import { Trip, Language, CustomEvent, UserProfile, ItineraryItem, FlightInfo } from '../types';
import { translations } from '../translations';
import { HOLIDAY_DATABASE } from '../services/holidayDatabase';
import { GoogleService } from '../services/driveService';

interface CalendarProps {
  trips: Trip[];
  customEvents: CustomEvent[];
  language: Language;
  darkMode: boolean;
  userProfile: UserProfile;
  onOpenTrip: (id: string) => void;
  onUpdateEvents: (events: CustomEvent[]) => void;
  onCombineTrips: (ids: string[]) => void;
  onUpdateTrip: (trip: Trip) => void;
}

const Calendar: React.FC<CalendarProps> = ({ trips, customEvents, language, darkMode, userProfile, onOpenTrip, onUpdateEvents, onCombineTrips, onUpdateTrip }) => {
  const t = translations[language];
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [isCombineMode, setIsCombineMode] = useState(false);
  const [selectedCombineIds, setSelectedCombineIds] = useState<string[]>([]);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [holidayRegion, setHolidayRegion] = useState(userProfile.nationality);

  // --- Drag and Drop State ---
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const touchItemRef = useRef<{ id: string, startDate: string } | null>(null);

  const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getUTCDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const addDays = (dateStr: string, days: number): string => {
    const d = getUTCDate(dateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  };

  const getDayDiff = (d1: string, d2: string): number => {
    const date1 = getUTCDate(d1);
    const date2 = getUTCDate(d2);
    return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleString(language, { month: 'long', year: 'numeric' });

  const getEventsForDay = (date: Date) => {
    const dateStr = toLocalISOString(date);
    const dayTrips = trips.filter(trip => dateStr >= trip.startDate && dateStr <= trip.endDate);
    const dayEvents = customEvents.filter(event => event.date === dateStr);
    const regionHolidays = HOLIDAY_DATABASE[holidayRegion] || [];
    const dayRegionHolidays = regionHolidays.filter(h => h.date === dateStr);
    return { dayTrips, dayEvents, dayRegionHolidays };
  };

  const handleDayClick = (date: Date) => {
    setNewHoliday({ ...newHoliday, date: toLocalISOString(date) });
    setShowHolidayModal(true);
  };

  const toggleTripSelection = (id: string) => {
    setSelectedCombineIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAddHoliday = () => {
    if (!newHoliday.name || !newHoliday.date) return;
    const event: CustomEvent = {
      id: `custom-${Date.now()}`,
      name: newHoliday.name,
      date: newHoliday.date,
      color: '#FFF9C4',
      type: 'custom',
      hasReminder: false
    };
    onUpdateEvents([...customEvents, event]);
    setShowHolidayModal(false);
    setNewHoliday({ name: '', date: '' });
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const handleGoogleSync = async () => {
    if (isSyncing) return;
    if (!window.confirm("Sync all trip events to Google Calendar? \nNote: This may create duplicates if you have synced before.")) return;

    setIsSyncing(true);
    try {
        let total = 0;
        for (const trip of trips) {
            total += await GoogleService.syncTripToCalendar(trip);
        }
        alert(`Successfully synced ${total} events!`);
    } catch (e) {
        console.error(e);
        alert("Sync failed. Please check permissions or popup blocker.");
    } finally {
        setIsSyncing(false);
    }
  };

  // --- REUSABLE MOVE LOGIC ---
  const executeMoveTrip = (tripId: string, originalDate: string, targetDate: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    const diff = getDayDiff(originalDate, targetDate);
    if (diff === 0) return;

    if (window.confirm(`Move "${trip.title}" to start on ${targetDate}?`)) {
        const newStartDate = addDays(trip.startDate, diff);
        const newEndDate = addDays(trip.endDate, diff);

        const newItinerary: Record<string, ItineraryItem[]> = {};
        Object.entries(trip.itinerary).forEach(([d, items]) => {
            newItinerary[addDays(d, diff)] = items as ItineraryItem[];
        });

        const newFlights: Record<string, FlightInfo[]> = {};
        if (trip.flights) {
            Object.entries(trip.flights).forEach(([d, items]) => {
                newFlights[addDays(d, diff)] = items as FlightInfo[];
            });
        }
        
        const newDayRatings: Record<string, number> = {};
        if (trip.dayRatings) {
            Object.entries(trip.dayRatings).forEach(([d, r]) => {
                newDayRatings[addDays(d, diff)] = r as number;
            });
        }

        const newExpenses = (trip.expenses || []).map(exp => ({
            ...exp,
            date: exp.date ? addDays(exp.date, diff) : exp.date
        }));

        onUpdateTrip({
            ...trip,
            startDate: newStartDate,
            endDate: newEndDate,
            itinerary: newItinerary,
            flights: newFlights,
            dayRatings: newDayRatings,
            expenses: newExpenses
        });
    }
  };

  // --- DESKTOP DRAG HANDLERS ---

  const onDragStart = (e: React.DragEvent, tripId: string, startDate: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('tripId', tripId);
    e.dataTransfer.setData('startDate', startDate);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(tripId);
  };

  const onDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(null);
    setDragOverDate(null);

    const tripId = e.dataTransfer.getData('tripId');
    const originalDate = e.dataTransfer.getData('startDate');

    if (tripId && originalDate && originalDate !== targetDate) {
        executeMoveTrip(tripId, originalDate, targetDate);
    }
  };

  // --- MOBILE TOUCH HANDLERS ---

  const handleTouchStart = (e: React.TouchEvent, tripId: string, startDate: string) => {
    // Only capture 1 finger touches
    if (e.touches.length !== 1) return;
    
    // We do NOT call preventDefault here to allow scrolling to start if the user swipes quickly.
    // However, if they hold and move, we might interpret it as a drag.
    // For better UX, let's delay the "drag mode" slightly or just assume lateral moves are drags.
    
    touchItemRef.current = { id: tripId, startDate };
    setDraggingId(tripId);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchItemRef.current) return;
    
    // Prevent default to stop scrolling while "dragging" the item
    if (e.cancelable) e.preventDefault();

    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Traverse up to find the date cell
    const dateCell = target?.closest('[data-date]');
    if (dateCell) {
      const dateStr = dateCell.getAttribute('data-date');
      if (dateStr && dateStr !== dragOverDate) {
        setDragOverDate(dateStr);
      }
    } else {
        setDragOverDate(null);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchItemRef.current) return;

    const { id, startDate } = touchItemRef.current;
    
    if (dragOverDate && dragOverDate !== startDate) {
        executeMoveTrip(id, startDate, dragOverDate);
    }

    // Reset
    touchItemRef.current = null;
    setDraggingId(null);
    setDragOverDate(null);
  };

  const exportToIcal = () => {
    const formatIcalDate = (dateStr: string) => {
      return dateStr.replace(/-/g, '') + 'T000000Z';
    };

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Wanderlust Journal//NONSGML v1.0//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    trips.forEach(trip => {
      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:trip-${trip.id}@wanderlust.app`);
      icsContent.push(`DTSTAMP:${formatIcalDate(new Date().toISOString().split('T')[0])}`);
      icsContent.push(`DTSTART;VALUE=DATE:${trip.startDate.replace(/-/g, '')}`);
      const endDate = new Date(trip.endDate);
      endDate.setDate(endDate.getDate() + 1);
      icsContent.push(`DTEND;VALUE=DATE:${endDate.toISOString().split('T')[0].replace(/-/g, '')}`);
      icsContent.push(`SUMMARY:✈️ Trip: ${trip.title}`);
      icsContent.push(`LOCATION:${trip.location}`);
      icsContent.push(`DESCRIPTION:${trip.description.replace(/\n/g, '\\n')}`);
      icsContent.push('END:VEVENT');
    });

    customEvents.forEach(event => {
      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:event-${event.id}@wanderlust.app`);
      icsContent.push(`DTSTAMP:${formatIcalDate(new Date().toISOString().split('T')[0])}`);
      icsContent.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`);
      const nextDay = new Date(event.date);
      nextDay.setDate(nextDay.getDate() + 1);
      icsContent.push(`DTEND;VALUE=DATE:${nextDay.toISOString().split('T')[0].replace(/-/g, '')}`);
      icsContent.push(`SUMMARY:📍 ${event.name}`);
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'wanderlust_calendar.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Header Section */}
      <div className="flex flex-col gap-6">
        
        {/* Top Row: Month Title & Navigation & Regions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white">{monthName}</h2>
            
            {/* Month Navigation - Moved here */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-700 shadow-sm transition-all text-zinc-500 dark:text-zinc-400 active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-700 shadow-sm transition-all text-zinc-500 dark:text-zinc-400 active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>

          {/* Region Selector */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-2xl overflow-x-auto no-scrollbar max-w-full">
            {Object.keys(HOLIDAY_DATABASE).map(region => (
              <button
                key={region}
                onClick={() => setHolidayRegion(region)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${holidayRegion === region ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' : 'text-zinc-500'}`}
              >
                {region === "United States" && "🇺🇸"}
                {region === "China" && "🇨🇳"}
                {region === "Hong Kong" && "🇭🇰"}
                {region === "Taiwan" && "🇹🇼"}
                {region === "United Kingdom" && "🇬🇧"}
                {region === "Japan" && "🇯🇵"}
                {" "}{region}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleGoogleSync}
              disabled={isSyncing}
              className="flex-1 min-w-[140px] px-6 py-3 rounded-2xl bg-white border border-zinc-200 text-zinc-600 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-zinc-50 flex justify-center items-center gap-2 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"/></svg>
              )}
              {t.syncToGoogle}
            </button>

            <button 
              onClick={exportToIcal}
              className="flex-1 min-w-[140px] px-6 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex justify-center items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              {t.exportToCalendar}
            </button>

            <button 
              onClick={() => {
                if (isCombineMode) {
                  onCombineTrips(selectedCombineIds);
                  setIsCombineMode(false);
                  setSelectedCombineIds([]);
                } else {
                  setIsCombineMode(true);
                }
              }}
              className={`flex-1 min-w-[140px] px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${isCombineMode ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
            >
              {isCombineMode ? `${t.confirmSelection} (${selectedCombineIds.length})` : t.combineTrips}
            </button>
        </div>
      </div>

      <div className={`grid grid-cols-7 gap-px rounded-[2rem] overflow-hidden border shadow-2xl ${darkMode ? 'bg-zinc-800 border-zinc-800' : 'bg-zinc-100 border-zinc-100'}`}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
          <div key={day} className={`p-4 text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : (darkMode ? 'bg-zinc-900 text-zinc-500' : 'bg-white text-zinc-400')}`}>
            {day}
          </div>
        ))}
        {daysInMonth.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} className={`h-32 sm:h-44 ${darkMode ? 'bg-zinc-950/50' : 'bg-zinc-50/50'}`} />;
          const dateStr = toLocalISOString(date);
          const { dayTrips, dayEvents, dayRegionHolidays } = getEventsForDay(date);
          const isToday = new Date().toDateString() === date.toDateString();
          const isSunday = date.getDay() === 0;
          const hasHoliday = dayRegionHolidays.length > 0;
          const isDragTarget = dragOverDate === dateStr;

          const dateLabelColor = (isSunday || hasHoliday)
            ? 'text-red-600 dark:text-red-400' 
            : (isToday ? 'text-indigo-600 font-black' : (darkMode ? 'text-zinc-500' : 'text-zinc-400'));

          return (
            <div 
              key={date.toISOString()}
              data-date={dateStr} // Critical for Touch Element Detection
              onClick={() => handleDayClick(date)}
              // Desktop Drag Events on the Cell Container
              onDragOver={(e) => onDragOver(e, dateStr)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, dateStr)}
              className={`h-32 sm:h-44 p-2 transition-all cursor-pointer relative group 
                ${darkMode ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-white hover:bg-zinc-50'} 
                ${isToday ? 'ring-2 ring-indigo-500 inset-0 z-10' : ''}
                ${isDragTarget ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-dashed border-indigo-500' : ''}
              `}
            >
              <div className="w-full h-full flex flex-col pointer-events-none">
                <span className={`text-[10px] font-black tabular-nums ${dateLabelColor}`}>{date.getDate()}</span>
                
                <div className="mt-2 space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)] no-scrollbar pointer-events-auto">
                  {dayRegionHolidays.map((holiday, hIdx) => (
                    <div 
                      key={`hol-${hIdx}`}
                      className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white truncate"
                    >
                      🚩 {holiday.name}
                    </div>
                  ))}
                  {dayEvents.map(event => (
                    <div 
                      key={event.id} 
                      className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400 truncate"
                    >
                      📍 {event.name}
                    </div>
                  ))}
                  {dayTrips.map(trip => (
                    <div
                      key={trip.id}
                      draggable={!isCombineMode}
                      onDragStart={(e) => onDragStart(e, trip.id, dateStr)}
                      // Mobile Touch Events
                      onTouchStart={(e) => handleTouchStart(e, trip.id, dateStr)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCombineMode) {
                          toggleTripSelection(trip.id);
                        } else {
                          onOpenTrip(trip.id);
                        }
                      }} 
                      className={`w-full text-left text-[8px] font-black px-1.5 py-1 rounded shadow-md truncate transition-all transform hover:scale-[1.02] border cursor-grab active:cursor-grabbing touch-none
                        ${selectedCombineIds.includes(trip.id) ? 'ring-2 ring-indigo-500 bg-indigo-600 text-white' : (trip.status === 'past' ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-indigo-500 border-indigo-600 text-white')}
                        ${draggingId === trip.id ? 'opacity-50 scale-105 shadow-xl z-50' : ''}
                      `}
                    >
                      ✈️ {trip.title}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showHolidayModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowHolidayModal(false)} />
          <div className={`relative z-10 w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <h3 className={`text-2xl font-black mb-6 tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{t.markSpecialDay}</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{t.labelName}</label>
                <input 
                  autoFocus
                  placeholder="🏷️ E.g. Anniversary" 
                  value={newHoliday.name} 
                  onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} 
                  className={`w-full p-4 rounded-2xl border-2 font-black outline-none ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-200'}`} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">📅 Date</label>
                <input 
                  type="date"
                  value={newHoliday.date} 
                  onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} 
                  className={`w-full p-4 rounded-2xl border-2 font-black outline-none ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-zinc-50 border-zinc-200'}`} 
                />
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={handleAddHoliday} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all uppercase tracking-widest text-xs">{t.addMarker}</button>
                <button onClick={() => setShowHolidayModal(false)} className={`w-full py-2 font-black uppercase tracking-widest text-[10px] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{t.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
