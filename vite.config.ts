import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    // Use relative base path for maximum portability (Netlify Drop, GitHub Pages, etc.)
    base: './',
    // Define process.env globally for the app to use
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ''),
      'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''),
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || process.env.SUPABASE_URL || ''),
      'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY || process.env.SUPABASE_KEY || '')
    }
  };
});