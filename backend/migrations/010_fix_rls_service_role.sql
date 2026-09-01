-- Fix RLS policies to allow service_role and backend operations to insert/update/select on all tables.
-- Apply after 001, 002, 003, 004, 005, 006, 007, 008, 009.

-- Enable bypass/full access policies for service_role on all public tables
DROP POLICY IF EXISTS service_role_all_users ON public.users;
CREATE POLICY service_role_all_users ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_conversations ON public.conversations;
CREATE POLICY service_role_all_conversations ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_messages ON public.messages;
CREATE POLICY service_role_all_messages ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_corrections ON public.corrections;
CREATE POLICY service_role_all_corrections ON public.corrections FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_user_progress ON public.user_progress;
CREATE POLICY service_role_all_user_progress ON public.user_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_phrases ON public.phrases;
CREATE POLICY service_role_all_phrases ON public.phrases FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_user_preferences ON public.user_preferences;
CREATE POLICY service_role_all_user_preferences ON public.user_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_conversation_feedback ON public.conversation_feedback;
CREATE POLICY service_role_all_conversation_feedback ON public.conversation_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_partner_recommendations ON public.partner_recommendations;
CREATE POLICY service_role_all_partner_recommendations ON public.partner_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Update messages policies to allow server assistant messages and owner inserts
DROP POLICY IF EXISTS messages_insert_own ON public.messages;
CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

DROP POLICY IF EXISTS messages_select_own ON public.messages;
CREATE POLICY messages_select_own ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

-- Update corrections policies
DROP POLICY IF EXISTS corrections_insert_own ON public.corrections;
CREATE POLICY corrections_insert_own ON public.corrections FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

DROP POLICY IF EXISTS corrections_select_own ON public.corrections;
CREATE POLICY corrections_select_own ON public.corrections FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = message_id AND (c.user_id = auth.uid() OR auth.uid() IS NULL OR auth.role() = 'service_role'))
);

-- Update user_progress policies
DROP POLICY IF EXISTS user_progress_insert_own ON public.user_progress;
CREATE POLICY user_progress_insert_own ON public.user_progress FOR INSERT WITH CHECK (
  auth.uid() = user_id OR auth.uid() IS NULL OR auth.role() = 'service_role'
);

DROP POLICY IF EXISTS user_progress_update_own ON public.user_progress;
CREATE POLICY user_progress_update_own ON public.user_progress FOR UPDATE USING (
  auth.uid() = user_id OR auth.uid() IS NULL OR auth.role() = 'service_role'
) WITH CHECK (
  auth.uid() = user_id OR auth.uid() IS NULL OR auth.role() = 'service_role'
);
