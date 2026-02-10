
import { createClient } from '@supabase/supabase-js';
import { Trip, TripVersion, ItineraryItem } from '../types';

// Use environment variables if available (e.g., from Vite define), otherwise fallback to defaults
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ssqjipmiyrwswroebmsm.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcWppcG1peXJ3c3dyb2VibXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzY3OTAsImV4cCI6MjA4NDE1Mjc5MH0.75OkDqfSNsF34x5gj4x_KZ9M0OLkFha2Y3FGvpMQ20A";

const getSupabaseConfig = () => {
  // 1. Priority: Environment Variables (or hardcoded defaults)
  if (SUPABASE_URL && SUPABASE_KEY) {
    return { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY };
  }

  // 2. Secondary: LocalStorage (set via Settings UI)
  const custom = localStorage.getItem('wanderlust_custom_supabase');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {
      console.error("Invalid custom config", e);
    }
  }
  return null;
};

// Initialize Supabase
let supabase: any = null;
const config = getSupabaseConfig();

if (config && config.supabaseUrl && config.supabaseKey) {
  try {
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
  } catch (e) {
    console.warn("Supabase initialization failed:", e);
  }
}

export class SupabaseService {
  
  static isCloudActive(): boolean {
    return !!supabase;
  }

  static isHardcoded(): boolean {
    return !!(SUPABASE_URL && SUPABASE_KEY);
  }

  // --- VERSIONING ---

  static async saveTripVersion(trip: Trip, note: string): Promise<string | null> {
    const userId = localStorage.getItem('wanderlust_sync_id') || 'guest';
    
    const data = {
      trip_id: trip.id,
      timestamp: new Date().toISOString(),
      note: note,
      data: trip,
      user_id: userId
    };

    if (this.isCloudActive()) {
      const { data: result, error } = await supabase
        .from('trip_versions')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result.id;
    } else {
      const key = `wanderlust_local_versions_${trip.id}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const newVersion = { id: `local-${Date.now()}`, ...data, tripId: trip.id };
      localStorage.setItem(key, JSON.stringify([newVersion, ...existing]));
      return newVersion.id;
    }
  }

  static async getTripVersions(tripId: string): Promise<TripVersion[]> {
    if (this.isCloudActive()) {
      const { data, error } = await supabase
        .from('trip_versions')
        .select('*')
        .eq('trip_id', tripId)
        .order('timestamp', { ascending: false });

      if (error) {
        console.error("Supabase Error:", error);
        return [];
      }

      return data.map((row: any) => ({
        id: row.id,
        tripId: row.trip_id,
        timestamp: row.timestamp,
        note: row.note,
        data: row.data
      })) as TripVersion[];
    } else {
      const key = `wanderlust_local_versions_${tripId}`;
      const versions = JSON.parse(localStorage.getItem(key) || '[]');
      return versions as TripVersion[];
    }
  }

  static async findVersions(query: string): Promise<TripVersion[]> {
    if (!this.isCloudActive()) return [];

    let { data, error } = await supabase
      .from('trip_versions')
      .select('*')
      .eq('trip_id', query)
      .order('timestamp', { ascending: false });

    if (!data || data.length === 0) {
       const res = await supabase
        .from('trip_versions')
        .select('*')
        .eq('user_id', query)
        .order('timestamp', { ascending: false });
       data = res.data;
       error = res.error;
    }

    if (error) {
      console.error("Search Error:", error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      tripId: row.trip_id,
      timestamp: row.timestamp,
      note: row.note,
      data: row.data
    })) as TripVersion[];
  }

  // --- GLOBAL SYNC ---

  /**
   * Overwrites the global backup for the given ID with localData.
   * No merging is performed.
   */
  static async saveGlobalBackup(syncId: string, localData: any): Promise<void> {
    const timestamp = new Date().toISOString();
    
    const backupData = {
      sync_id: syncId,
      timestamp: timestamp,
      data: localData,
      user_id: 'guest'
    };

    if (this.isCloudActive()) {
      const { error } = await supabase
        .from('global_backups')
        .upsert(backupData, { onConflict: 'sync_id' });
      
      if (error) throw error;
    } else {
      localStorage.setItem(`wanderlust_backup_${syncId}`, JSON.stringify(backupData));
    }
  }

  static async loadGlobalBackup(syncId: string): Promise<{ data: any, timestamp: string } | null> {
    if (this.isCloudActive()) {
      const { data, error } = await supabase
        .from('global_backups')
        .select('data, timestamp')
        .eq('sync_id', syncId)
        .single();

      if (error || !data) return null;
      return { data: data.data, timestamp: data.timestamp };
    } else {
      const stored = localStorage.getItem(`wanderlust_backup_${syncId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { data: parsed.data, timestamp: parsed.timestamp };
      }
      return null;
    }
  }
}
