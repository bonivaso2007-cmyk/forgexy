import { createClient } from '@supabase/supabase-js';

let supabaseClient: any = null;

export const getSupabase = () => {
    // Dynamically query variables each check to support runtime updates
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem("FORGE_SUPABASE_URL") || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || localStorage.getItem("FORGE_SUPABASE_ANON_KEY") || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('Supabase env vars missing. Supabase functionality disabled.');
        return null;
    }
    
    if (!supabaseClient) {
        try {
            supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
        } catch (e) {
            console.error("Failed to initialize Supabase client:", e);
            return null;
        }
    }
    return supabaseClient;
};

export const reinitializeSupabase = (url: string, key: string) => {
    if (url && key) {
        localStorage.setItem("FORGE_SUPABASE_URL", url);
        localStorage.setItem("FORGE_SUPABASE_ANON_KEY", key);
        try {
            supabaseClient = createClient(url, key);
            return supabaseClient;
        } catch (e) {
            console.error("Failed to reinitialize Supabase client:", e);
            return null;
        }
    }
    return null;
};

export const supabase = {
    get auth() {
        return getSupabase()?.auth || null;
    },
    from(relation: string) {
        const client = getSupabase();
        if (!client) {
            throw new Error("Supabase client is not initialized.");
        }
        return client.from(relation);
    },
    // Support direct boolean check (e.g. if (supabase))
    // by allowing coercion, or we can just define a value check
    get isInitialized() {
        return getSupabase() !== null;
    }
};

