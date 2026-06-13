-- Users table (syncs with auth or standalone for custom auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt_hex TEXT NOT NULL,
  is_guest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Founder profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT UNIQUE NOT NULL,
  name TEXT,
  age TEXT,
  city TEXT,
  country TEXT,
  industry TEXT,
  market TEXT,
  target_customer TEXT,
  stage TEXT,
  tech_level TEXT,
  funding TEXT,
  constraints TEXT,
  bio TEXT,
  incomplete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved ideas with Q&A history
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  idea_id TEXT NOT NULL,
  text TEXT NOT NULL,
  score INTEGER,
  label TEXT,
  verdict TEXT,
  strengths TEXT[],
  gaps TEXT[],
  qa JSONB DEFAULT '[]',
  outputs JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(uid, idea_id)
);

-- Analytics tracking
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  uid TEXT,
  session_count INTEGER DEFAULT 0,
  reality_check_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(uid)
);

-- Vouching sentinel logs
CREATE TABLE sentinel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  challenge_title TEXT NOT NULL,
  defense TEXT NOT NULL,
  verdict TEXT,
  chronos_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venture XP and streaks
CREATE TABLE venture_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  uid TEXT UNIQUE NOT NULL,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  completed_quests TEXT[] DEFAULT '{}',
  cofounder_memories TEXT[] DEFAULT '{}',
  traction_metrics JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users
CREATE POLICY "select_own_users" ON users FOR SELECT
  TO authenticated USING (auth.uid()::text = uid OR id = auth.uid());
CREATE POLICY "insert_own_users" ON users FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid OR auth.uid() IS NULL);
CREATE POLICY "update_own_users" ON users FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid OR id = auth.uid());

-- RLS Policies: profiles
CREATE POLICY "select_own_profiles" ON profiles FOR SELECT
  TO authenticated USING (auth.uid()::text = uid OR user_id = auth.uid());
CREATE POLICY "insert_own_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "update_own_profiles" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid);

-- RLS Policies: ideas
CREATE POLICY "select_own_ideas" ON ideas FOR SELECT
  TO authenticated USING (auth.uid()::text = uid OR user_id = auth.uid());
CREATE POLICY "insert_own_ideas" ON ideas FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "update_own_ideas" ON ideas FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "delete_own_ideas" ON ideas FOR DELETE
  TO authenticated USING (auth.uid()::text = uid);

-- RLS Policies: analytics
CREATE POLICY "select_own_analytics" ON analytics FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_analytics" ON analytics FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "update_own_analytics" ON analytics FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid);

-- RLS Policies: sentinel_logs
CREATE POLICY "select_own_sentinel" ON sentinel_logs FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_sentinel" ON sentinel_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);

-- RLS Policies: venture_stats
CREATE POLICY "select_own_venture" ON venture_stats FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_venture" ON venture_stats FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "update_own_venture" ON venture_stats FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid);

-- Indexes for performance
CREATE INDEX idx_ideas_user ON ideas(user_id);
CREATE INDEX idx_ideas_uid ON ideas(uid);
CREATE INDEX idx_profiles_uid ON profiles(uid);