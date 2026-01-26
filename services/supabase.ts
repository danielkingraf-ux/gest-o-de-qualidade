
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  const mode = import.meta.env.MODE || 'unknown';
  const isVercel = Boolean(import.meta.env.VERCEL);
  const hint = isVercel
    ? 'Configure them in Vercel Settings > Environment Variables and redeploy.'
    : 'Define them in your .env.local file (Vite) or your hosting environment.';
  throw new Error(
    `Missing environment variables: ${missing.join(', ')}. ` +
    `mode=${mode}; vercel=${isVercel}. ${hint}`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
