import { createClient } from '@supabase/supabase-js';

let supabaseClient: any = null;

export const getSupabase = () => {
    if (!supabaseClient) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
        
        if (!supabaseUrl || !supabaseAnonKey) {
            console.warn('Supabase env vars missing. Supabase functionality disabled.');
            return null;
        }
        
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    return supabaseClient;
};

export const supabase = getSupabase();
