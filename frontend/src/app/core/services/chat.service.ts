import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  Conversation,
  CreateConversationRequest,
  Message,
} from '@voice-chat/shared';
import { ApiService } from './api.service';

/** Provides authenticated REST access to conversation metadata and persisted history. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);

  /** Returns the authenticated user's conversations, newest first. */
  list(): Observable<Conversation[]> {
    return this.api
      .get<ApiResponse<Conversation[]>>('/conversations')
      .pipe(map((response) => response.data));
  }

  /** Creates a new conversation for the authenticated user. */
  create(language?: string): Observable<Conversation> {
    const request: CreateConversationRequest = language ? { language } : {};
    return this.api
      .post<ApiResponse<Conversation>, CreateConversationRequest>('/conversations', request)
      .pipe(map((response) => response.data));
  }

  /** Loads stable chronological message history for an owned conversation. */
  loadMessages(conversationId: string): Observable<Message[]> {
    return this.api
      .get<ApiResponse<Message[]>>(`/conversations/${encodeURIComponent(conversationId)}/messages`)
      .pipe(map((response) => response.data));
  }
}
