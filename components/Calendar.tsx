
import React, { useState, useMemo } from 'react';
import { Trip, Language, CustomEvent, UserProfile } from '../types';
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
}

const Calendar: React.FC<CalendarProps> = ({ trips, customEvents, language, darkMode, userProfile, onOpenTrip, onUpdateEvents, onCombineTrips }) => {
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

  const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  /**
   * Generates and downloads an .ics file containing trips and custom events.
   */
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

    // Add Trips
    trips.forEach(trip => {
      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:trip-${trip.id}@wanderlust.app`);
      icsContent.push(`DTSTAMP:${formatIcalDate(new Date().toISOString().split('T')[0])}`);
      icsContent.push(`DTSTART;VALUE=DATE:${trip.startDate.replace(/-/g, '')}`);
      // iCal DTEND for all-day events is exclusive, so we add 1 day
      const endDate = new Date(trip.endDate);
      endDate.setDate(endDate.getDate() + 1);
      icsContent.push(`DTEND;VALUE=DATE:${endDate.toISOString().split('T')[0].replace(/-/g, '')}`);
      icsContent.push(`SUMMARY:✈️ Trip: ${trip.title}`);
      icsContent.push(`LOCATION:${trip.location}`);
      icsContent.push(`DESCRIPTION:${trip.description.replace(/\n/g, '\\n')}`);
      icsContent.push('END:VEVENT');
    });

    // Add Custom Events
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-3xl font-black tracking-tight">{monthName}</h2>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Holiday Region Selector */}
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

          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
            <button 
              onClick={handleGoogleSync}
              disabled={isSyncing}
              className="px-6 py-3 rounded-2xl bg-white border border-zinc-200 text-zinc-600 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-zinc-50 flex items-center gap-2 whitespace-nowrap dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="px-6 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-2 whitespace-nowrap"
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
              className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${isCombineMode ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
            >
              {isCombineMode ? `${t.confirmSelection} (${selectedCombineIds.length})` : t.combineTrips}
            </button>
            
            <div className="flex gap-1">
              <button onClick={() => navigateMonth(-1)} className="p-3 rounded-2xl border dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <button onClick={() => navigateMonth(1)} className="p-3 rounded-2xl border dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
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
          const { dayTrips, dayEvents, dayRegionHolidays } = getEventsForDay(date);
          const isToday = new Date().toDateString() === date.toDateString();
          const isSunday = date.getDay() === 0;
          const hasHoliday = dayRegionHolidays.length > 0;

          const dateLabelColor = (isSunday || hasHoliday)
            ? 'text-red-600 dark:text-red-400' 
            : (isToday ? 'text-indigo-600 font-black' : (darkMode ? 'text-zinc-500' : 'text-zinc-400'));

          return (
            <div 
              key={date.toISOString()} 
              onClick={() => handleDayClick(date)}
              className={`h-32 sm:h-44 p-2 transition-colors cursor-pointer relative group ${darkMode ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-white hover:bg-zinc-50'} ${isToday ? 'ring-2 ring-indigo-500 inset-0 z-10' : ''}`}
            >
              <span className={`text-[10px] font-black tabular-nums ${dateLabelColor}`}>{date.getDate()}</span>
              
              <div className="mt-2 space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)] no-scrollbar">
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
                  <button 
                    key={trip.id} 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isCombineMode) {
                        toggleTripSelection(trip.id);
                      } else {
                        onOpenTrip(trip.id);
                      }
                    }} 
                    className={`w-full text-left text-[8px] font-black px-1.5 py-1 rounded shadow-md truncate transition-all transform hover:scale-[1.02] border ${selectedCombineIds.includes(trip.id) ? 'ring-2 ring-indigo-500 bg-indigo-600 text-white' : (trip.status === 'past' ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-indigo-500 border-indigo-600 text-white')}`}
                  >
                    ✈️ {trip.title}
                  </button>
                ))}
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
