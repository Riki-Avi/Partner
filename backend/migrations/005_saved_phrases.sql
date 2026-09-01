-- Saved phrases. Apply after 001, 002, 003, and 004. Independent of 004, so order between the two
-- does not matter.
--
-- A phrase is captured with zero friction and translated later: saving must never wait on a model
-- call, because the whole point is jotting something down when there is no time to study it. The
-- translation columns are therefore nullable and filled on first request, then cached.

CREATE TABLE IF NOT EXISTS public.phrases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 1000),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  source_language VARCHAR(60),
  translation TEXT,
  explanation TEXT,
  translated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  last_reviewed_at TIMESTAMPTZ,
  mastered BOOLEAN NOT NULL DEFAULT FALSE
);

-- Study lists read "my phrases, newest first", optionally narrowed to what is still pending.
CREATE INDEX IF NOT EXISTS idx_phrases_user_created
  ON public.phrases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phrases_user_pending
  ON public.phrases(user_id, mastered, created_at DESC);

ALTER TABLE public.phrases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phrases_select_own ON public.phrases;
CREATE POLICY phrases_select_own ON public.phrases
  FOR SELECT USING (auth.uid() = user_id);

-- Phrases are created, translated, and graded through the authenticated API, so the backend stays
-- their only writer. Revoking direct DML keeps a browser JWT from writing rows that skip the
-- content validation, or from faking translation and review state through the Data API.
DROP POLICY IF EXISTS phrases_insert_own ON public.phrases;
DROP POLICY IF EXISTS phrases_update_own ON public.phrases;
DROP POLICY IF EXISTS phrases_delete_own ON public.phrases;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.phrases FROM anon, authenticated;
