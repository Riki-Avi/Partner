-- Voice Chat Foundation: schema, ownership constraints, and complete RLS CRUD policies.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL CHECK (length(trim(email)) > 3),
  name VARCHAR(255) NOT NULL CHECK (length(trim(name)) > 0),
  level VARCHAR(50) NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON public.users(email);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  language VARCHAR(50) NOT NULL DEFAULT 'en' CHECK (length(trim(language)) > 0),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_started_at ON public.conversations(started_at DESC);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  audio_url TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  has_corrections BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON public.messages(timestamp);

CREATE TABLE public.corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  error_type VARCHAR(100) NOT NULL CHECK (length(trim(error_type)) > 0),
  original TEXT NOT NULL,
  corrected TEXT NOT NULL,
  explanation TEXT NOT NULL
);
CREATE INDEX idx_corrections_message_id ON public.corrections(message_id);

CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_conversations INTEGER NOT NULL DEFAULT 0 CHECK (total_conversations >= 0),
  total_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_time_minutes >= 0),
  common_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(common_errors) = 'array'),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_progress_user_id ON public.user_progress(user_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Profiles are owned directly by auth.uid().
CREATE POLICY users_select_own ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_insert_own ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY users_update_own ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY users_delete_own ON public.users FOR DELETE USING (auth.uid() = id);

-- Conversations are owned through user_id.
CREATE POLICY conversations_select_own ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY conversations_insert_own ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY conversations_update_own ON public.conversations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY conversations_delete_own ON public.conversations FOR DELETE USING (auth.uid() = user_id);

-- Message ownership is inherited from the parent conversation.
CREATE POLICY messages_select_own ON public.messages FOR SELECT USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY messages_update_own ON public.messages FOR UPDATE USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY messages_delete_own ON public.messages FOR DELETE USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- Correction ownership is inherited through message and conversation.
CREATE POLICY corrections_select_own ON public.corrections FOR SELECT USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND c.user_id = auth.uid()));
CREATE POLICY corrections_insert_own ON public.corrections FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND c.user_id = auth.uid()));
CREATE POLICY corrections_update_own ON public.corrections FOR UPDATE USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND c.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND c.user_id = auth.uid()));
CREATE POLICY corrections_delete_own ON public.corrections FOR DELETE USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND c.user_id = auth.uid()));

-- Progress is owned directly through user_id.
CREATE POLICY user_progress_select_own ON public.user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_progress_insert_own ON public.user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_progress_update_own ON public.user_progress FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_progress_delete_own ON public.user_progress FOR DELETE USING (auth.uid() = user_id);
