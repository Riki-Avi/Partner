-- Persistent chat-turn idempotency and partial-turn recovery. Apply after 001.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_message_id UUID NULL,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_reply_to_message_id_fkey
      FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_client_message_id_user_only'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_client_message_id_user_only
      CHECK (client_message_id IS NULL OR role = 'user');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_reply_to_message_id_assistant_only'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_reply_to_message_id_assistant_only
      CHECK (reply_to_message_id IS NULL OR role = 'assistant');
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_client_message_id
  ON public.messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
  ON public.messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
