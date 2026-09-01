-- Partner preferences, recommendations, and conversation feedback.
-- Apply after 001, 002, 003, 004, 005.

-- User preferences for personalized partner interaction
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  interests TEXT[] NOT NULL DEFAULT '{}',
  goals TEXT[] NOT NULL DEFAULT '{}',
  tone VARCHAR(50) NOT NULL DEFAULT 'friendly',
  custom_topics TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_select_own ON public.user_preferences;
CREATE POLICY user_preferences_select_own ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_delete_own ON public.user_preferences;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_preferences FROM anon, authenticated;

-- Conversation satisfaction ratings and feedback
CREATE TABLE IF NOT EXISTS public.conversation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  satisfaction_score INTEGER NOT NULL CHECK (satisfaction_score BETWEEN 1 AND 5),
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversation_feedback_conversation UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_feedback_user
  ON public.conversation_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_feedback_conversation
  ON public.conversation_feedback(conversation_id);

ALTER TABLE public.conversation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_feedback_select_own ON public.conversation_feedback;
CREATE POLICY conversation_feedback_select_own ON public.conversation_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS conversation_feedback_insert_own ON public.conversation_feedback;
DROP POLICY IF EXISTS conversation_feedback_update_own ON public.conversation_feedback;
DROP POLICY IF EXISTS conversation_feedback_delete_own ON public.conversation_feedback;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.conversation_feedback FROM anon, authenticated;

-- Partner recommendations tailored to the user's tastes
CREATE TABLE IF NOT EXISTS public.partner_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  starter_prompt TEXT NOT NULL,
  difficulty VARCHAR(50) NOT NULL DEFAULT 'intermediate',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_recommendations_user
  ON public.partner_recommendations(user_id, created_at DESC);

ALTER TABLE public.partner_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_recommendations_select_own ON public.partner_recommendations;
CREATE POLICY partner_recommendations_select_own ON public.partner_recommendations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS partner_recommendations_insert_own ON public.partner_recommendations;
DROP POLICY IF EXISTS partner_recommendations_update_own ON public.partner_recommendations;
DROP POLICY IF EXISTS partner_recommendations_delete_own ON public.partner_recommendations;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.partner_recommendations FROM anon, authenticated;
