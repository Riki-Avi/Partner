-- Conversation titles and active-turn enforcement. Apply after 001 and 002.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS title VARCHAR(120);

UPDATE public.conversations
SET title = 'English practice'
WHERE title IS NULL OR length(trim(title)) = 0;

ALTER TABLE public.conversations
  ALTER COLUMN title SET DEFAULT 'English practice',
  ALTER COLUMN title SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.conversations'::regclass
      AND conname = 'conversations_title_valid'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_title_valid
      CHECK (length(trim(title)) BETWEEN 1 AND 120);
  END IF;
END
$$;

-- Direct authenticated writes may create or edit only user-authored messages in active
-- owned conversations. Backend service-role writes still bypass RLS so accepted assistant
-- replies can finish after a conversation is ended.
DROP POLICY IF EXISTS messages_insert_own ON public.messages;
CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT
  WITH CHECK (
    role = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND c.ended_at IS NULL
    )
  );

DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE
  USING (
    role = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND c.ended_at IS NULL
    )
  )
  WITH CHECK (
    role = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND c.ended_at IS NULL
    )
  );

-- The application backend is the exclusive writer for chat lifecycle and history. Revoking
-- direct DML prevents a browser JWT from reopening conversations, forging timing metadata,
-- bypassing turn serialization, or injecting unvalidated history through the Data API.
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.conversations, public.messages
  FROM anon, authenticated;

-- Serialize user-message insertion against ending the parent conversation. This closes
-- the gap between the socket's friendly preflight check and the actual write while
-- still allowing an already-accepted turn to persist its assistant response.
CREATE OR REPLACE FUNCTION public.reject_user_message_for_ended_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conversation_ended_at TIMESTAMPTZ;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT ended_at
  INTO conversation_ended_at
  FROM public.conversations
  WHERE id = NEW.conversation_id
  FOR SHARE;

  IF FOUND AND conversation_ended_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CONVERSATION_ENDED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_reject_user_when_conversation_ended ON public.messages;
CREATE TRIGGER messages_reject_user_when_conversation_ended
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_user_message_for_ended_conversation();
