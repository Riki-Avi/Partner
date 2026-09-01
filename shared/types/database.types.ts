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
  user_id: string;
  error_type: string;
  original: string;
  corrected: string;
  explanation: string;
  created_at: string;
  review_count: number;
  last_reviewed_at: string | null;
  mastered: boolean;
}

/** A correction plus the message and conversation it came from, for the study list. */
export interface CorrectionReviewItem extends Correction {
  message_content: string;
  conversation_id: string;
  conversation_title: string;
}

export interface CorrectionErrorTypeCount {
  error_type: string;
  count: number;
}

export interface CorrectionStats {
  total: number;
  pending: number;
  mastered: number;
  byErrorType: CorrectionErrorTypeCount[];
}

/**
 * A phrase the learner saved to study later.
 *
 * The translation fields stay null until the learner asks for one, so a phrase can be captured
 * without waiting on the tutor.
 */
export interface SavedPhrase {
  id: string;
  user_id: string;
  content: string;
  note: string | null;
  source_language: string | null;
  translation: string | null;
  explanation: string | null;
  translated_at: string | null;
  created_at: string;
  review_count: number;
  last_reviewed_at: string | null;
  mastered: boolean;
}

export interface PhraseStats {
  total: number;
  pending: number;
  mastered: number;
  untranslated: number;
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

export type PartnerTone = 'friendly' | 'casual' | 'intellectual' | 'supportive' | 'professional';

export interface UserPreferences {
  user_id: string;
  interests: string[];
  goals: string[];
  tone: PartnerTone;
  custom_topics: string;
  updated_at: string;
}

export interface ConversationFeedback {
  id: string;
  conversation_id: string;
  user_id: string;
  satisfaction_score: number;
  tags: string[];
  notes: string | null;
  created_at: string;
}

export interface PartnerRecommendation {
  id: string;
  user_id: string;
  category: 'topic' | 'roleplay' | 'challenge' | 'casual' | 'debate';
  title: string;
  description: string;
  starter_prompt: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  is_favorite: boolean;
  context_reason?: string | null;
  created_at: string;
}

export interface ChatMemorySnippet {
  conversationId: string;
  title: string;
  startedAt: string;
  userMessagesCount: number;
  userSnippets: string[];
  assistantSnippets: string[];
  errorTypes: string[];
  satisfactionScore?: number | null;
  feedbackNotes?: string | null;
}

export interface PartnerSatisfactionStats {
  totalRated: number;
  averageScore: number;
  topTags: { tag: string; count: number }[];
}

export interface PartnerHubSummary {
  preferences: UserPreferences;
  recommendations: PartnerRecommendation[];
  stats: PartnerSatisfactionStats;
  recentFeedbacks: (ConversationFeedback & { conversation_title?: string })[];
}

export type AdventureRole = 'user' | 'guide' | 'playful' | 'serious' | 'narrator';

export interface AdventureCharacter {
  id: string;
  adventure_id: string;
  name: string;
  role: 'guide' | 'playful' | 'serious' | 'narrator';
  personality: string;
  avatar_emoji: string;
  voice_pitch: number;
  created_at: string;
}

export interface AdventureTurnCorrection {
  original: string;
  corrected: string;
  explanation: string;
  error_type: string;
}

export interface AdventureTurn {
  id: string;
  adventure_id: string;
  speaker_role: AdventureRole;
  speaker_name: string;
  content: string;
  corrections?: AdventureTurnCorrection[];
  action_chips?: string[];
  timestamp: string;
}

export interface StoryAdventure {
  id: string;
  user_id: string;
  title: string;
  theme: string;
  setting: string;
  summary: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  characters: AdventureCharacter[];
  turns: AdventureTurn[];
}

export interface AdventureTurnResponse {
  userTurn: AdventureTurn;
  characterReplies: AdventureTurn[];
  adventure: StoryAdventure;
}
