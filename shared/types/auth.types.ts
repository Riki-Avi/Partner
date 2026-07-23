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
}
