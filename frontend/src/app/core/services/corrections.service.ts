import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  Correction,
  CorrectionReviewItem,
  CorrectionStats,
  ReviewCorrectionRequest,
} from '@voice-chat/shared';
import { ApiService } from './api.service';

export type CorrectionFilter = 'all' | 'pending' | 'mastered';

/** Provides authenticated REST access to saved corrections and their review progress. */
@Injectable({ providedIn: 'root' })
export class CorrectionsService {
  private readonly api = inject(ApiService);

  /**
   * Lists the authenticated user's corrections, newest first.
   * @param status Which slice of the study pile to return.
   * @param errorType Optional error type to narrow the list to.
   * @returns Corrections with the message and conversation they came from.
   */
  list(status: CorrectionFilter = 'all', errorType?: string): Observable<CorrectionReviewItem[]> {
    const params = new URLSearchParams({ status });
    if (errorType) params.set('errorType', errorType);
    return this.api
      .get<ApiResponse<CorrectionReviewItem[]>>(`/corrections?${params.toString()}`)
      .pipe(map((response) => response.data));
  }

  /** Returns pending, mastered, and per-error-type counts. */
  stats(): Observable<CorrectionStats> {
    return this.api
      .get<ApiResponse<CorrectionStats>>('/corrections/stats')
      .pipe(map((response) => response.data));
  }

  /**
   * Records study progress on one correction.
   * @param correctionId Correction to update.
   * @param changes `reviewed` counts a practice attempt; `mastered` retires or restores it.
   */
  review(correctionId: string, changes: ReviewCorrectionRequest): Observable<Correction> {
    return this.api
      .patch<
        ApiResponse<Correction>,
        ReviewCorrectionRequest
      >(`/corrections/${encodeURIComponent(correctionId)}`, changes)
      .pipe(map((response) => response.data));
  }
}
