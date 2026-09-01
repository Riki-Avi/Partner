-- Correction review and study. Apply after 001, 002, and 003.
--
-- Corrections were reachable only through message -> conversation -> user. Reviewing them is a
-- per-user query ordered by recency, so the owner is denormalized onto the row: it turns a
-- two-level EXISTS chain into a single indexed predicate and lets RLS match the simple pattern
-- already used by conversations. The redundancy is safe because corrections cascade-delete with
-- their message, and the backend is the exclusive writer.

ALTER TABLE public.corrections
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mastered BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill the owner and a truthful creation time from the corrected message.
UPDATE public.corrections AS co
SET
  user_id = COALESCE(co.user_id, c.user_id),
  created_at = COALESCE(co.created_at, m.timestamp)
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE m.id = co.message_id
  AND (co.user_id IS NULL OR co.created_at IS NULL);

-- Defensive: a correction whose message vanished cannot be attributed to anyone. The cascade
-- should make this impossible, so this only clears rows left by a partially applied migration.
DELETE FROM public.corrections WHERE user_id IS NULL;

UPDATE public.corrections SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE public.corrections
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.corrections'::regclass
      AND conname = 'corrections_user_id_fkey'
  ) THEN
    ALTER TABLE public.corrections
      ADD CONSTRAINT corrections_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.corrections'::regclass
      AND conname = 'corrections_review_count_valid'
  ) THEN
    ALTER TABLE public.corrections
      ADD CONSTRAINT corrections_review_count_valid CHECK (review_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.corrections'::regclass
      AND conname = 'corrections_text_present'
  ) THEN
    ALTER TABLE public.corrections
      ADD CONSTRAINT corrections_text_present
      CHECK (length(trim(original)) > 0 AND length(trim(corrected)) > 0);
  END IF;
END
$$;

-- Study lists read "my corrections, newest first", optionally narrowed to what is still pending.
CREATE INDEX IF NOT EXISTS idx_corrections_user_created
  ON public.corrections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_user_pending
  ON public.corrections(user_id, mastered, created_at DESC);

-- Ownership now reads straight from the row instead of walking two joins.
DROP POLICY IF EXISTS corrections_select_own ON public.corrections;
CREATE POLICY corrections_select_own ON public.corrections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS corrections_insert_own ON public.corrections;
DROP POLICY IF EXISTS corrections_update_own ON public.corrections;
DROP POLICY IF EXISTS corrections_delete_own ON public.corrections;

-- Corrections are produced by the tutor and reviewed through the authenticated API, so the
-- backend is their only writer. Revoking direct DML stops a browser JWT from inventing
-- corrections, editing explanations, or faking review progress through the Data API.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.corrections FROM anon, authenticated;
