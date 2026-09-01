import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  ConversationFeedback,
  PartnerHubSummary,
  PartnerRecommendation,
  SaveFeedbackRequest,
  UpdatePreferencesRequest,
  UserPreferences,
} from '@voice-chat/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PartnerService {
  private readonly api = inject(ApiService);

  /** Retrieves the full summary for the Partner section. */
  getSummary(): Observable<PartnerHubSummary> {
    return this.api
      .get<ApiResponse<PartnerHubSummary>>('/partner/summary')
      .pipe(map((res) => res.data));
  }

  /** Gets user partner preferences. */
  getPreferences(): Observable<UserPreferences> {
    return this.api
      .get<ApiResponse<UserPreferences>>('/partner/preferences')
      .pipe(map((res) => res.data));
  }

  /** Updates user partner preferences (interests, goals, tone, custom topics). */
  updatePreferences(request: UpdatePreferencesRequest): Observable<UserPreferences> {
    return this.api
      .put<ApiResponse<UserPreferences>, UpdatePreferencesRequest>('/partner/preferences', request)
      .pipe(map((res) => res.data));
  }

  /** Retrieves the current list of recommended conversations. */
  getRecommendations(): Observable<PartnerRecommendation[]> {
    return this.api
      .get<ApiResponse<PartnerRecommendation[]>>('/partner/recommendations')
      .pipe(map((res) => res.data));
  }

  /** Triggers Gemini to generate a fresh set of personalized recommendations. */
  refreshRecommendations(): Observable<PartnerRecommendation[]> {
    return this.api
      .post<
        ApiResponse<PartnerRecommendation[]>,
        Record<string, never>
      >('/partner/recommendations/refresh', {})
      .pipe(map((res) => res.data));
  }

  /** Toggles favorite status for a recommendation card. */
  toggleFavorite(recommendationId: string): Observable<PartnerRecommendation> {
    return this.api
      .post<
        ApiResponse<PartnerRecommendation>,
        Record<string, never>
      >(`/partner/recommendations/${encodeURIComponent(recommendationId)}/favorite`, {})
      .pipe(map((res) => res.data));
  }

  /** Submits satisfaction score and feedback for a conversation. */
  saveFeedback(request: SaveFeedbackRequest): Observable<ConversationFeedback> {
    return this.api
      .post<ApiResponse<ConversationFeedback>, SaveFeedbackRequest>('/partner/feedback', request)
      .pipe(map((res) => res.data));
  }

  /** Fetches feedback previously submitted for a conversation. */
  getConversationFeedback(conversationId: string): Observable<ConversationFeedback | null> {
    return this.api
      .get<
        ApiResponse<ConversationFeedback | null>
      >(`/partner/feedback/${encodeURIComponent(conversationId)}`)
      .pipe(map((res) => res.data));
  }
}
