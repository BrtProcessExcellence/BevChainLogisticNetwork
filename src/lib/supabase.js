import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[SUPABASE] URL or Key is missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
