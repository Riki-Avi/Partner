import type { User } from './database.types.js';

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthData {
  user: User;
  token: string;
}
export interface AuthResponse {
  success: true;
  data: AuthData;
  message?: string;
}
export interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
}
export interface AuthRequest {
  userId?: string;
  accessToken?: string;
}
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface CreateConversationRequest {
  language?: string;
  title?: string;
}

export interface RenameConversationRequest {
  title: string;
}

export interface SynthesizeSpeechRequest {
  text: string;
}

export interface TranscribeSpeechData {
  text: string;
}

/** Marks a correction as practised, mastered, or back in the pending pile. */
export interface ReviewCorrectionRequest {
  reviewed?: boolean;
  mastered?: boolean;
}

export interface CreatePhraseRequest {
  content: string;
  note?: string;
}

/** Updates a saved phrase's note and/or its review progress. */
export interface UpdatePhraseRequest {
  note?: string | null;
  reviewed?: boolean;
  mastered?: boolean;
}

export interface SaveFeedbackRequest {
  conversation_id: string;
  satisfaction_score: number;
  tags?: string[];
  notes?: string | null;
}

export interface UpdatePreferencesRequest {
  interests?: string[];
  goals?: string[];
  tone?: string;
  custom_topics?: string;
}
