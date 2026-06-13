import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type User = {
  id: string;
  uid: string;
  email: string;
  name: string;
  password_hash: string;
  salt_hex: string;
  is_guest: boolean;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  user_id: string;
  uid: string;
  name: string;
  age: string;
  city: string;
  country: string;
  industry: string;
  market: string;
  target_customer: string;
  stage: string;
  tech_level: string;
  funding: string;
  constraints: string;
  bio: string;
  incomplete: boolean;
  created_at: string;
  updated_at: string;
};

export type Idea = {
  id: string;
  user_id: string;
  uid: string;
  idea_id: string;
  text: string;
  score: number | null;
  label: string | null;
  verdict: string | null;
  strengths: string[] | null;
  gaps: string[] | null;
  qa: any[];
  outputs: any;
  created_at: string;
  updated_at: string;
};

export type VentureStats = {
  id: string;
  user_id: string;
  uid: string;
  xp: number;
  streak: number;
  completed_quests: string[];
  cofounder_memories: string[];
  traction_metrics: any[];
};
