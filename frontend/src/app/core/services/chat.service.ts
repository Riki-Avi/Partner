import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  Conversation,
  CreateConversationRequest,
  Message,
  RenameConversationRequest,
} from '@voice-chat/shared';
import { ApiService } from './api.service';

interface DeletedConversationData {
  conversationId: string;
}

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
  create(language = 'en', title = 'English practice'): Observable<Conversation> {
    const request: CreateConversationRequest = { language, title };
    return this.api
      .post<ApiResponse<Conversation>, CreateConversationRequest>('/conversations', request)
      .pipe(map((response) => response.data));
  }

  /** Renames an owned conversation. */
  rename(conversationId: string, title: string): Observable<Conversation> {
    const request: RenameConversationRequest = { title };
    return this.api
      .patch<
        ApiResponse<Conversation>,
        RenameConversationRequest
      >(`/conversations/${encodeURIComponent(conversationId)}`, request)
      .pipe(map((response) => response.data));
  }

  /** Ends an owned conversation using server-derived timing. */
  end(conversationId: string): Observable<Conversation> {
    return this.api
      .post<
        ApiResponse<Conversation>,
        Record<string, never>
      >(`/conversations/${encodeURIComponent(conversationId)}/end`, {})
      .pipe(map((response) => response.data));
  }

  /** Deletes an owned conversation and returns its identifier. */
  delete(conversationId: string): Observable<string> {
    return this.api
      .delete<
        ApiResponse<DeletedConversationData>
      >(`/conversations/${encodeURIComponent(conversationId)}`)
      .pipe(map((response) => response.data.conversationId));
  }

  /** Loads stable chronological message history for an owned conversation. */
  loadMessages(conversationId: string): Observable<Message[]> {
    return this.api
      .get<ApiResponse<Message[]>>(`/conversations/${encodeURIComponent(conversationId)}/messages`)
      .pipe(map((response) => response.data));
  }
}
