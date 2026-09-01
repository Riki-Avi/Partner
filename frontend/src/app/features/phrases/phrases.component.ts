import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, type Subscription } from 'rxjs';
import type { PhraseStats, SavedPhrase, UpdatePhraseRequest } from '@voice-chat/shared';
import { PhrasesService, type PhraseFilter } from '../../core/services/phrases.service';
import { SpeechService } from '../../core/services/speech.service';

type PhraseMode = 'list' | 'practice';

/** Which composer field a dictation session is filling. */
type DictationTarget = 'content' | 'note';

const MAX_PHRASE_LENGTH = 1000;
const MAX_NOTE_LENGTH = 500;

/**
 * The learner's phrase notebook.
 *
 * Capturing is deliberately the cheapest action on the page: a phrase is saved with one field and
 * no model call, because it exists to be jotted down when there is no time to study it. Translation
 * happens on demand and is cached by the backend.
 */
@Component({
  selector: 'app-phrases',
  standalone: true,
  imports: [DatePipe, NgClass, NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './phrases.component.html',
  styleUrl: './phrases.component.css',
})
export class PhrasesComponent implements OnDestroy {
  readonly contentControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_PHRASE_LENGTH)],
  });
  readonly noteControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(MAX_NOTE_LENGTH)],
  });
  readonly maxPhraseLength = MAX_PHRASE_LENGTH;

  phrases: SavedPhrase[] = [];
  stats: PhraseStats | null = null;
  filter: PhraseFilter = 'pending';
  mode: PhraseMode = 'list';
  loading = true;
  saving = false;
  errorMessage = '';
  busyId: string | null = null;

  practiceIndex = 0;
  revealed = false;

  isListening = false;
  isTranscribing = false;
  dictationTarget: DictationTarget | null = null;
  voiceError = '';
  speakingPhraseId: string | null = null;

  private dictationSubscription: Subscription | null = null;
  private readonly phrases$ = inject(PhrasesService);
  private readonly speech = inject(SpeechService);
  private readonly destroyRef = inject(DestroyRef);

  readonly recordingSupported = this.speech.recordingSupported;
  readonly synthesisSupported = this.speech.synthesisSupported;

  constructor() {
    this.speech.listening$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((listening) => (this.isListening = listening));
    this.speech.transcribing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((transcribing) => (this.isTranscribing = transcribing));
    this.speech.speaking$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((speaking) => {
      if (!speaking) this.speakingPhraseId = null;
    });
    this.speech.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => (this.voiceError = message ?? ''));
    this.load();
  }

  ngOnDestroy(): void {
    this.cancelDictation();
    this.speech.stopSpeaking();
  }

  get currentCard(): SavedPhrase | undefined {
    return this.phrases[this.practiceIndex];
  }

  get practiceFinished(): boolean {
    return this.phrases.length > 0 && this.practiceIndex >= this.phrases.length;
  }

  get canSave(): boolean {
    return (
      !this.saving &&
      // Saving mid-dictation would store a phrase the transcript has not finished filling.
      !this.dictationTarget &&
      !!this.contentControl.value.trim() &&
      this.contentControl.valid
    );
  }

  handleSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  save(): void {
    const content = this.contentControl.value.trim();
    if (!content || !this.canSave) return;
    const note = this.noteControl.value.trim();

    this.saving = true;
    this.errorMessage = '';
    this.phrases$
      .create(content, note || undefined)
      .pipe(
        finalize(() => (this.saving = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (phrase) => {
          this.contentControl.reset('');
          this.noteControl.reset('');
          // A new phrase is untranslated and pending, so it belongs in every filter but "mastered".
          if (this.filter !== 'mastered') this.phrases = [phrase, ...this.phrases];
          this.refreshStats();
        },
        error: () => (this.errorMessage = 'Could not save that phrase. Please try again.'),
      });
  }

  /** True while a dictation session is filling the given field. */
  isDictating(target: DictationTarget): boolean {
    return this.dictationTarget === target;
  }

  canStartDictation(): boolean {
    return this.recordingSupported && !this.isTranscribing && !this.saving;
  }

  /**
   * Records a phrase or note by voice instead of typing.
   *
   * The transcript is appended to whatever is already in the field rather than replacing it, so
   * dictation can add to a partly typed phrase, and it is never saved automatically.
   */
  toggleDictation(target: DictationTarget): void {
    if (this.dictationTarget === target) {
      // The upload is already in flight; stopping again would discard an incoming transcript.
      if (!this.isTranscribing) this.speech.stopListening();
      return;
    }
    if (this.dictationTarget || !this.canStartDictation()) return;

    this.speech.stopSpeaking();
    this.speakingPhraseId = null;
    this.voiceError = '';
    this.dictationTarget = target;

    const control = target === 'content' ? this.contentControl : this.noteControl;
    const limit = target === 'content' ? MAX_PHRASE_LENGTH : MAX_NOTE_LENGTH;
    let subscription: Subscription | null = null;
    subscription = this.speech
      .startListening()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transcript) => {
          const draft = control.value.trimEnd();
          const combined = draft ? `${draft} ${transcript}` : transcript;
          if (combined.length > limit)
            this.voiceError = `The transcript was shortened to the ${limit}-character limit.`;
          control.setValue(combined.slice(0, limit));
          control.markAsTouched();
        },
        error: (error: unknown) => {
          this.voiceError =
            error instanceof Error ? error.message : 'Dictation could not be completed.';
          this.finishDictation(subscription);
        },
        complete: () => this.finishDictation(subscription),
      });
    this.dictationSubscription = subscription.closed ? null : subscription;
    if (subscription.closed) this.dictationTarget = null;
  }

  /** Reads an English translation aloud so it can be practised by ear. */
  toggleSpeak(phrase: SavedPhrase): void {
    if (!phrase.translation || !this.synthesisSupported) return;
    if (this.speakingPhraseId === phrase.id) {
      this.speech.stopSpeaking();
      this.speakingPhraseId = null;
      return;
    }

    this.cancelDictation();
    this.voiceError = '';
    this.speech.speak(phrase.translation);
    this.speakingPhraseId = phrase.id;
  }

  isSpeaking(phrase: SavedPhrase): boolean {
    return this.speakingPhraseId === phrase.id;
  }

  setFilter(filter: PhraseFilter): void {
    if (this.filter === filter) return;
    this.filter = filter;
    this.load();
  }

  setMode(mode: PhraseMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.restartPractice();
  }

  restartPractice(): void {
    this.practiceIndex = 0;
    this.revealed = false;
  }

  /** Fetches the translation, or reveals the cached one without spending a model call. */
  translate(phrase: SavedPhrase): void {
    if (this.busyId) return;
    if (phrase.translation) {
      this.revealed = true;
      return;
    }

    this.busyId = phrase.id;
    this.errorMessage = '';
    this.phrases$
      .translate(phrase.id)
      .pipe(
        finalize(() => (this.busyId = null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.replaceLocally(updated);
          this.revealed = true;
          this.refreshStats();
        },
        error: () =>
          (this.errorMessage = 'Could not translate that phrase right now. Please try again.'),
      });
  }

  practiseAgain(phrase: SavedPhrase): void {
    this.applyUpdate(phrase, { reviewed: true }, false);
  }

  markMastered(phrase: SavedPhrase): void {
    this.applyUpdate(phrase, { reviewed: true, mastered: true }, true);
  }

  restore(phrase: SavedPhrase): void {
    this.applyUpdate(phrase, { mastered: false }, true);
  }

  remove(phrase: SavedPhrase): void {
    if (this.busyId || typeof window === 'undefined') return;
    if (!window.confirm(`Delete “${phrase.content}”?`)) return;

    this.busyId = phrase.id;
    this.errorMessage = '';
    this.phrases$
      .delete(phrase.id)
      .pipe(
        finalize(() => (this.busyId = null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.removeLocally(phrase.id);
          this.revealed = false;
          this.refreshStats();
        },
        error: () => (this.errorMessage = 'Could not delete that phrase. Please try again.'),
      });
  }

  trackPhrase(_index: number, phrase: SavedPhrase): string {
    return phrase.id;
  }

  private load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.restartPractice();

    this.phrases$
      .list(this.filter)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (phrases) => (this.phrases = phrases),
        error: () => (this.errorMessage = 'Could not load your phrases. Please try again.'),
      });
    this.refreshStats();
  }

  private applyUpdate(
    phrase: SavedPhrase,
    changes: UpdatePhraseRequest,
    mayLeaveFilter: boolean,
  ): void {
    if (this.busyId) return;
    this.busyId = phrase.id;
    this.errorMessage = '';

    this.phrases$
      .update(phrase.id, changes)
      .pipe(
        finalize(() => (this.busyId = null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          const leavesFilter =
            mayLeaveFilter &&
            ((this.filter === 'pending' && updated.mastered) ||
              (this.filter === 'mastered' && !updated.mastered));

          if (leavesFilter) this.removeLocally(updated.id);
          else this.replaceLocally(updated);

          if (this.mode === 'practice') {
            this.revealed = false;
            // Removing the graded card shifts the next one into the current index already.
            if (!leavesFilter) this.practiceIndex += 1;
          }
          this.refreshStats();
        },
        error: () => (this.errorMessage = 'Could not save your progress. Please try again.'),
      });
  }

  private replaceLocally(updated: SavedPhrase): void {
    this.phrases = this.phrases.map((phrase) => (phrase.id === updated.id ? updated : phrase));
  }

  private removeLocally(phraseId: string): void {
    this.phrases = this.phrases.filter((phrase) => phrase.id !== phraseId);
  }

  private finishDictation(subscription: Subscription | null): void {
    if (subscription && this.dictationSubscription !== subscription) return;
    this.dictationSubscription = null;
    this.dictationTarget = null;
  }

  /** Drops the recording and any pending transcription without producing a transcript. */
  private cancelDictation(): void {
    this.dictationSubscription?.unsubscribe();
    this.dictationSubscription = null;
    this.dictationTarget = null;
    this.speech.abortListening();
  }

  private refreshStats(): void {
    this.phrases$
      .stats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => (this.stats = stats),
        error: () => undefined,
      });
  }
}
