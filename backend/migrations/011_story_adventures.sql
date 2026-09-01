-- 011_story_adventures.sql: Interactive Multi-Agent Story Adventures (Story Mode)
-- Apply after 001, 002, 003, 004, 005, 006, 007, 008, 009, 010.

CREATE TABLE IF NOT EXISTS public.adventures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  theme VARCHAR(80) NOT NULL,
  setting TEXT NOT NULL,
  summary TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adventures_user_status ON public.adventures(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.adventure_characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adventure_id UUID NOT NULL REFERENCES public.adventures(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('guide', 'playful', 'serious', 'narrator')),
  personality TEXT NOT NULL,
  avatar_emoji VARCHAR(20) NOT NULL DEFAULT '🧙‍♂️',
  voice_pitch NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adventure_characters_adventure ON public.adventure_characters(adventure_id);

CREATE TABLE IF NOT EXISTS public.adventure_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adventure_id UUID NOT NULL REFERENCES public.adventures(id) ON DELETE CASCADE,
  speaker_role VARCHAR(40) NOT NULL CHECK (speaker_role IN ('user', 'guide', 'playful', 'serious', 'narrator')),
  speaker_name VARCHAR(80) NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  corrections JSONB DEFAULT '[]'::jsonb,
  action_chips JSONB DEFAULT '[]'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adventure_turns_adventure_time ON public.adventure_turns(adventure_id, timestamp ASC);

-- Row Level Security
ALTER TABLE public.adventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adventure_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adventure_turns ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON TABLE public.adventures TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.adventure_characters TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.adventure_turns TO anon, authenticated, service_role;

-- Policies for service_role
DROP POLICY IF EXISTS service_role_all_adventures ON public.adventures;
CREATE POLICY service_role_all_adventures ON public.adventures FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_adventure_characters ON public.adventure_characters;
CREATE POLICY service_role_all_adventure_characters ON public.adventure_characters FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_adventure_turns ON public.adventure_turns;
CREATE POLICY service_role_all_adventure_turns ON public.adventure_turns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- User Policies
DROP POLICY IF EXISTS adventures_user_policy ON public.adventures;
CREATE POLICY adventures_user_policy ON public.adventures FOR ALL USING (
  user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'
) WITH CHECK (
  user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'
);

DROP POLICY IF EXISTS adventure_characters_user_policy ON public.adventure_characters;
CREATE POLICY adventure_characters_user_policy ON public.adventure_characters FOR ALL USING (
  EXISTS (SELECT 1 FROM public.adventures a WHERE a.id = adventure_id AND (a.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.adventures a WHERE a.id = adventure_id AND (a.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

DROP POLICY IF EXISTS adventure_turns_user_policy ON public.adventure_turns;
CREATE POLICY adventure_turns_user_policy ON public.adventure_turns FOR ALL USING (
  EXISTS (SELECT 1 FROM public.adventures a WHERE a.id = adventure_id AND (a.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.adventures a WHERE a.id = adventure_id AND (a.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);
