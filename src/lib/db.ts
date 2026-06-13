import { supabase, User, Profile, Idea, VentureStats } from './supabase.js';

const ANON_UID = 'guest_user';

// Helper to get or create anonymous user ID
function getAnonUid(): string {
  try {
    const session = localStorage.getItem('forge_session');
    if (session) {
      const parsed = JSON.parse(session);
      return parsed.uid || ANON_UID;
    }
  } catch {}
  return ANON_UID;
}

// User operations
export async function getUser(uid: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  return data;
}

export async function createUser(user: {
  uid: string;
  email: string;
  name: string;
  password_hash: string;
  salt_hex: string;
  is_guest?: boolean;
}): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      uid: user.uid,
      email: user.email,
      name: user.name,
      password_hash: user.password_hash,
      salt_hex: user.salt_hex,
      is_guest: user.is_guest || false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    return null;
  }
  return data;
}

export async function updateUser(uid: string, updates: Partial<User>): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('uid', uid)
    .select()
    .single();

  if (error) {
    console.error('Error updating user:', error);
    return null;
  }
  return data;
}

// Profile operations
export async function getProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
    }
    return null;
  }
  return data;
}

export async function createProfile(profile: {
  uid: string;
  name?: string;
  age?: string;
  city?: string;
  country?: string;
  industry?: string;
  market?: string;
  target_customer?: string;
  stage?: string;
  tech_level?: string;
  funding?: string;
  constraints?: string;
  bio?: string;
  incomplete?: boolean;
}): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    return null;
  }
  return data;
}

export async function updateProfile(uid: string, updates: Partial<Profile>): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('uid', uid)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    return null;
  }
  return data;
}

// Idea operations
export async function getIdeas(uid: string): Promise<Idea[]> {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('uid', uid)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching ideas:', error);
    return [];
  }
  return data || [];
}

export async function getIdea(uid: string, ideaId: string): Promise<Idea | null> {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('uid', uid)
    .eq('idea_id', ideaId)
    .single();

  if (error) {
    console.error('Error fetching idea:', error);
    return null;
  }
  return data;
}

export async function saveIdea(idea: {
  uid: string;
  idea_id: string;
  text: string;
  score?: number;
  label?: string;
  verdict?: string;
  strengths?: string[];
  gaps?: string[];
  qa?: any[];
  outputs?: any;
}): Promise<Idea | null> {
  const { data, error } = await supabase
    .from('ideas')
    .upsert({
      uid: idea.uid,
      idea_id: idea.idea_id,
      text: idea.text,
      score: idea.score || null,
      label: idea.label || null,
      verdict: idea.verdict || null,
      strengths: idea.strengths || null,
      gaps: idea.gaps || null,
      qa: idea.qa || [],
      outputs: idea.outputs || {},
    }, { onConflict: 'uid,idea_id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving idea:', error);
    return null;
  }
  return data;
}

export async function deleteIdea(uid: string, ideaId: string): Promise<boolean> {
  const { error } = await supabase
    .from('ideas')
    .delete()
    .eq('uid', uid)
    .eq('idea_id', ideaId);

  if (error) {
    console.error('Error deleting idea:', error);
    return false;
  }
  return true;
}

// Analytics operations
export async function getAnalytics(uid: string): Promise<{ session_count: number; reality_check_count: number }> {
  const { data, error } = await supabase
    .from('analytics')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Create new analytics record
      const { data: newData } = await supabase
        .from('analytics')
        .insert({ uid, session_count: 1, reality_check_count: 0 })
        .select()
        .single();
      return newData || { session_count: 1, reality_check_count: 0 };
    }
    console.error('Error fetching analytics:', error);
    return { session_count: 0, reality_check_count: 0 };
  }
  return { session_count: data.session_count, reality_check_count: data.reality_check_count };
}

export async function incrementAnalytics(uid: string, field: 'session_count' | 'reality_check_count'): Promise<void> {
  // First, ensure the record exists
  const current = await getAnalytics(uid);

  const { error } = await supabase
    .from('analytics')
    .upsert({
      uid,
      session_count: current.session_count + (field === 'session_count' ? 1 : 0),
      reality_check_count: current.reality_check_count + (field === 'reality_check_count' ? 1 : 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'uid' });

  if (error) {
    console.error('Error updating analytics:', error);
  }
}

// Venture stats operations
export async function getVentureStats(uid: string): Promise<VentureStats | null> {
  const { data, error } = await supabase
    .from('venture_stats')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Create new venture stats record
      const { data: newData } = await supabase
        .from('venture_stats')
        .insert({ uid, xp: 120, streak: 1, completed_quests: [], cofounder_memories: [], traction_metrics: [] })
        .select()
        .single();
      return newData;
    }
    console.error('Error fetching venture stats:', error);
    return null;
  }
  return data;
}

export async function updateVentureStats(uid: string, updates: Partial<VentureStats>): Promise<VentureStats | null> {
  const { data, error } = await supabase
    .from('venture_stats')
    .upsert({ uid, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'uid' })
    .select()
    .single();

  if (error) {
    console.error('Error updating venture stats:', error);
    return null;
  }
  return data;
}

// Sentinel logs operations
export async function saveSentinelLog(log: {
  uid: string;
  challenge_title: string;
  defense: string;
  verdict: string;
  chronos_score: number;
}): Promise<void> {
  const { error } = await supabase
    .from('sentinel_logs')
    .insert(log);

  if (error) {
    console.error('Error saving sentinel log:', error);
  }
}

export async function getSentinelLogs(uid: string, limit: number = 10): Promise<any[]> {
  const { data, error } = await supabase
    .from('sentinel_logs')
    .select('*')
    .eq('uid', uid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching sentinel logs:', error);
    return [];
  }
  return data || [];
}

// Hybrid storage - uses Supabase when authenticated, localStorage for guests
export const store = {
  async get(key: string): Promise<any> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },

  async del(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {}
  },

  async list(prefix: string): Promise<string[]> {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(prefix));
    } catch {
      return [];
    }
  },
};
