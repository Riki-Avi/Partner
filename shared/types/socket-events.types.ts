import type { Message } from './database.types.js';

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
  'chat:error': (payload: ChatErrorPayload) => void;
}
