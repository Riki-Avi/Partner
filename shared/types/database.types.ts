export type UserLevel = 'beginner' | 'intermediate' | 'advanced';
export type MessageRole = 'user' | 'assistant';

export interface User {
  id: string;
  email: string;
  name: string;
  level: UserLevel;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  language: string;
  duration_seconds: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  audio_url: string | null;
  timestamp: string;
  has_corrections: boolean;
  client_message_id: string | null;
  reply_to_message_id: string | null;
}

export interface Correction {
  id: string;
  message_id: string;
  error_type: string;
  original: string;
  corrected: string;
  explanation: string;
}

export interface CommonError {
  type: string;
  count: number;
  lastSeen: string;
}
export interface UserProgress {
  id: string;
  user_id: string;
  total_conversations: number;
  total_time_minutes: number;
  common_errors: CommonError[];
  last_updated: string;
}
