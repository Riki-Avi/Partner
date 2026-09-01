import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import type { CorrectionReviewItem, CorrectionStats } from '@voice-chat/shared';
import { CorrectionsService, type CorrectionFilter } from '../../core/services/corrections.service';

type StudyMode = 'list' | 'practice';

/**
 * Review surface for the mistakes the tutor corrected.
 *
 * Two modes read the same list: browsing, and a reveal-then-grade card for active recall. Grading a
 * card always records a practice attempt, so the counter reflects effort rather than only success.
 */
@Component({
  selector: 'app-study',
  standalone: true,
  imports: [DatePipe, NgClass, NgFor, NgIf],
  templateUrl: './study.component.html',
  styleUrl: './study.component.css',
})
export class StudyComponent {
  corrections: CorrectionReviewItem[] = [];
  stats: CorrectionStats | null = null;
  filter: CorrectionFilter = 'pending';
  errorTypeFilter = '';
  mode: StudyMode = 'list';
  loading = true;
  errorMessage = '';
  updatingId: string | null = null;

  /** Index into {@link corrections} while in practice mode. */
  practiceIndex = 0;
  revealed = false;

  private readonly corrections$ = inject(CorrectionsService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
  }

  get currentCard(): CorrectionReviewItem | undefined {
    return this.corrections[this.practiceIndex];
  }

  get practiceFinished(): boolean {
    return this.corrections.length > 0 && this.practiceIndex >= this.corrections.length;
  }

  setFilter(filter: CorrectionFilter): void {
    if (this.filter === filter) return;
    this.filter = filter;
    this.load();
  }

  setErrorType(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    this.errorTypeFilter = select?.value ?? '';
    this.load();
  }

  setMode(mode: StudyMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.restartPractice();
  }

  restartPractice(): void {
    this.practiceIndex = 0;
    this.revealed = false;
  }

  reveal(): void {
    this.revealed = true;
  }

  /** Counts a practice attempt and keeps the correction in the pending pile. */
  practiseAgain(item: CorrectionReviewItem): void {
    this.applyReview(item, { reviewed: true }, false);
  }

  /** Counts a practice attempt and retires the correction from the pending pile. */
  markMastered(item: CorrectionReviewItem): void {
    this.applyReview(item, { reviewed: true, mastered: true }, true);
  }

  /** Returns a mastered correction to the pending pile without counting an attempt. */
  restore(item: CorrectionReviewItem): void {
    this.applyReview(item, { mastered: false }, true);
  }

  trackCorrection(_index: number, item: CorrectionReviewItem): string {
    return item.id;
  }

  private load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.restartPractice();

    this.corrections$
      .list(this.filter, this.errorTypeFilter || undefined)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (corrections) => (this.corrections = corrections),
        error: () => (this.errorMessage = 'Could not load your corrections. Please try again.'),
      });

    this.corrections$
      .stats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => (this.stats = stats),
        error: () => undefined,
      });
  }

  /**
   * Sends a review update and reconciles the local list.
   * @param item Correction being graded.
   * @param changes Review flags to persist.
   * @param mayLeaveFilter Whether the change can move the row out of the active filter, in which
   * case it is removed locally instead of updated so the visible list stays truthful.
   */
  private applyReview(
    item: CorrectionReviewItem,
    changes: { reviewed?: boolean; mastered?: boolean },
    mayLeaveFilter: boolean,
  ): void {
    if (this.updatingId) return;
    this.updatingId = item.id;
    this.errorMessage = '';

    this.corrections$
      .review(item.id, changes)
      .pipe(
        finalize(() => (this.updatingId = null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          const leavesFilter =
            mayLeaveFilter &&
            ((this.filter === 'pending' && updated.mastered) ||
              (this.filter === 'mastered' && !updated.mastered));

          if (leavesFilter) this.removeLocally(item.id);
          else
            this.corrections = this.corrections.map((current) =>
              current.id === updated.id ? { ...current, ...updated } : current,
            );

          this.advanceAfterGrading(leavesFilter);
          this.refreshStats();
        },
        error: () => (this.errorMessage = 'Could not save your progress. Please try again.'),
      });
  }

  /**
   * Removing the graded card shifts the next one into the current index, so only a card that stayed
   * in the list needs the index advanced.
   */
  private advanceAfterGrading(removed: boolean): void {
    if (this.mode !== 'practice') return;
    this.revealed = false;
    if (!removed) this.practiceIndex += 1;
  }

  private removeLocally(correctionId: string): void {
    this.corrections = this.corrections.filter((current) => current.id !== correctionId);
  }

  private refreshStats(): void {
    this.corrections$
      .stats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => (this.stats = stats),
        error: () => undefined,
      });
  }
}
