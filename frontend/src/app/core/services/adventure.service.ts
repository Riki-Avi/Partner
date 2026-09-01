import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiResponse, AdventureTurnResponse, StoryAdventure } from '@voice-chat/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AdventureService {
  private readonly api = inject(ApiService);

  /** Retrieves the active story adventure, or initializes a personalized one. */
  getCurrent(): Observable<StoryAdventure> {
    return this.api
      .get<ApiResponse<StoryAdventure>>('/adventures/current')
      .pipe(map((res) => res.data));
  }

  /** Submits a player dialogue or action in the adventure and receives party replies + corrections. */
  sendTurn(message: string): Observable<AdventureTurnResponse> {
    return this.api
      .post<ApiResponse<AdventureTurnResponse>, { message: string }>('/adventures/turn', {
        message,
      })
      .pipe(map((res) => res.data));
  }

  /** Resets and generates a fresh adventure based on latest chats. */
  resetAdventure(): Observable<StoryAdventure> {
    return this.api
      .post<ApiResponse<StoryAdventure>, Record<string, never>>('/adventures/reset', {})
      .pipe(map((res) => res.data));
  }
}
