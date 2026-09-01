import type { Correction, Message } from './database.types.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface AuthenticatedPayload {
  userId: string;
}
export interface PingPayload {
  timestamp: number;
}
export interface SocketErrorPayload {
  code: string;
  message: string;
}
export interface ChatSendPayload {
  conversationId: string;
  content: string;
  clientMessageId: string;
}
export interface ChatMessagePayload {
  message: Message;
  clientMessageId?: string;
}
export interface ChatTypingPayload {
  conversationId: string;
  typing: boolean;
}
/**
 * Corrections the tutor found in one user message.
 *
 * Delivered separately from `chat:message` because the corrections describe the user's message
 * while they are produced alongside the assistant's reply, and because a turn may legitimately
 * carry none.
 */
export interface ChatCorrectionsPayload {
  conversationId: string;
  messageId: string;
  clientMessageId?: string;
  corrections: Correction[];
}
export interface ChatErrorPayload extends SocketErrorPayload {
  conversationId?: string;
  clientMessageId?: string;
}
export interface ClientEvents {
  ping: (payload: PingPayload) => void;
  'chat:send': (payload: ChatSendPayload) => void;
}
export interface ServerEvents {
  authenticated: (payload: AuthenticatedPayload) => void;
  pong: (payload: PingPayload) => void;
  error: (payload: SocketErrorPayload) => void;
  'chat:message': (payload: ChatMessagePayload) => void;
  'chat:typing': (payload: ChatTypingPayload) => void;
  'chat:corrections': (payload: ChatCorrectionsPayload) => void;
  'chat:error': (payload: ChatErrorPayload) => void;
}
