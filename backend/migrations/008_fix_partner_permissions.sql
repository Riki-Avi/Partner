-- Fix table permissions and RLS policies on partner tables so service role and authenticated users can insert/update.
-- Apply after 001, 002, 003, 004, 005, 006, 007.

GRANT ALL ON TABLE public.user_preferences TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.conversation_feedback TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.partner_recommendations TO anon, authenticated, service_role;

-- user_preferences policies
DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_delete_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_all_own ON public.user_preferences;
CREATE POLICY user_preferences_all_own ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- conversation_feedback policies
DROP POLICY IF EXISTS conversation_feedback_insert_own ON public.conversation_feedback;
DROP POLICY IF EXISTS conversation_feedback_update_own ON public.conversation_feedback;
DROP POLICY IF EXISTS conversation_feedback_delete_own ON public.conversation_feedback;
DROP POLICY IF EXISTS conversation_feedback_all_own ON public.conversation_feedback;
CREATE POLICY conversation_feedback_all_own ON public.conversation_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- partner_recommendations policies
DROP POLICY IF EXISTS partner_recommendations_insert_own ON public.partner_recommendations;
DROP POLICY IF EXISTS partner_recommendations_update_own ON public.partner_recommendations;
DROP POLICY IF EXISTS partner_recommendations_delete_own ON public.partner_recommendations;
DROP POLICY IF EXISTS partner_recommendations_all_own ON public.partner_recommendations;
CREATE POLICY partner_recommendations_all_own ON public.partner_recommendations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
