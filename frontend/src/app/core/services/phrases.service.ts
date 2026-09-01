import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  CreatePhraseRequest,
  PhraseStats,
  SavedPhrase,
  UpdatePhraseRequest,
} from '@voice-chat/shared';
import { ApiService } from './api.service';

export type PhraseFilter = 'all' | 'pending' | 'mastered' | 'untranslated';

interface DeletedPhraseData {
  phraseId: string;
}

/** Provides authenticated REST access to the learner's saved phrases. */
@Injectable({ providedIn: 'root' })
export class PhrasesService {
  private readonly api = inject(ApiService);

  /** Lists saved phrases, newest first. */
  list(status: PhraseFilter = 'all'): Observable<SavedPhrase[]> {
    const params = new URLSearchParams({ status });
    return this.api
      .get<ApiResponse<SavedPhrase[]>>(`/phrases?${params.toString()}`)
      .pipe(map((response) => response.data));
  }

  /** Returns pending, mastered, and untranslated counts. */
  stats(): Observable<PhraseStats> {
    return this.api
      .get<ApiResponse<PhraseStats>>('/phrases/stats')
      .pipe(map((response) => response.data));
  }

  /** Saves a phrase without translating it, so capturing stays instant. */
  create(content: string, note?: string): Observable<SavedPhrase> {
    const request: CreatePhraseRequest = note ? { content, note } : { content };
    return this.api
      .post<ApiResponse<SavedPhrase>, CreatePhraseRequest>('/phrases', request)
      .pipe(map((response) => response.data));
  }

  /**
   * Asks the tutor to translate a phrase and explain it.
   *
   * The backend caches the result, so calling this again returns the stored translation instead of
   * spending another model call.
   */
  translate(phraseId: string): Observable<SavedPhrase> {
    return this.api
      .post<
        ApiResponse<SavedPhrase>,
        Record<string, never>
      >(`/phrases/${encodeURIComponent(phraseId)}/translate`, {})
      .pipe(map((response) => response.data));
  }

  /** Records study progress or edits the note on a phrase. */
  update(phraseId: string, changes: UpdatePhraseRequest): Observable<SavedPhrase> {
    return this.api
      .patch<
        ApiResponse<SavedPhrase>,
        UpdatePhraseRequest
      >(`/phrases/${encodeURIComponent(phraseId)}`, changes)
      .pipe(map((response) => response.data));
  }

  /** Deletes a saved phrase and returns its identifier. */
  delete(phraseId: string): Observable<string> {
    return this.api
      .delete<ApiResponse<DeletedPhraseData>>(`/phrases/${encodeURIComponent(phraseId)}`)
      .pipe(map((response) => response.data.phraseId));
  }
}
