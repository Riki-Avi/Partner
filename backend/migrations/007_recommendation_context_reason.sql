-- Add context_reason to partner_recommendations to indicate how the topic was inspired by past chats or preferences.
-- Apply after 001, 002, 003, 004, 005, 006.

ALTER TABLE public.partner_recommendations
  ADD COLUMN IF NOT EXISTS context_reason TEXT;
