-- Founder memory bank for compounding intelligence
CREATE TABLE founder_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  category TEXT NOT NULL, -- 'strength', 'weakness', 'pattern', 'lesson', 'preference'
  content TEXT NOT NULL,
  source TEXT, -- 'qa', 'reality_check', 'investor_sim', 'sentinel'
  confidence INTEGER DEFAULT 50, -- 0-100 how confident the AI is
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_referenced TIMESTAMPTZ DEFAULT NOW(),
  reference_count INTEGER DEFAULT 0
);

-- Investor simulation sessions
CREATE TABLE investor_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  persona TEXT NOT NULL, -- 'yc_partner', 'angel', 'vc_analyst', 'corporate_dev'
  transcript JSONB DEFAULT '[]',
  score INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly digest logs
CREATE TABLE weekly_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  week_start DATE NOT NULL,
  ideas_validated INTEGER DEFAULT 0,
  avg_score INTEGER,
  top_insights TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(uid, week_start)
);

-- Enable RLS
ALTER TABLE founder_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "select_own_memories" ON founder_memories FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_memories" ON founder_memories FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "update_own_memories" ON founder_memories FOR UPDATE
  TO authenticated USING (auth.uid()::text = uid);

CREATE POLICY "select_own_sims" ON investor_simulations FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_sims" ON investor_simulations FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);

CREATE POLICY "select_own_digests" ON weekly_digests FOR SELECT
  TO authenticated USING (auth.uid()::text = uid);
CREATE POLICY "insert_own_digests" ON weekly_digests FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = uid);

CREATE INDEX idx_memories_uid ON founder_memories(uid);
CREATE INDEX idx_memories_category ON founder_memories(category);
CREATE INDEX idx_sims_uid ON investor_simulations(uid);