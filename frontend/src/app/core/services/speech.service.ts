import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface RecognitionSession {
  recognition: SpeechRecognition;
  stopRequested: boolean;
  finish: () => void;
}

/** Browser Web Speech adapter for one-shot English dictation and text-to-speech. */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  readonly recognitionSupported = this.recognitionConstructor() !== null;
  readonly synthesisSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  private readonly listeningSubject = new BehaviorSubject(false);
  private readonly speakingSubject = new BehaviorSubject(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  readonly listening$ = this.listeningSubject.asObservable();
  readonly speaking$ = this.speakingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  private activeRecognition: RecognitionSession | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  /** Starts one non-continuous recognition session and emits its complete final transcript. */
  startListening(): Observable<string> {
    return new Observable<string>((subscriber) => {
      const Recognition = this.recognitionConstructor();
      if (!Recognition) {
        const message = 'Speech recognition is not supported in this browser.';
        this.errorSubject.next(message);
        subscriber.error(new Error(message));
        return undefined;
      }

      this.stopListening();
      this.stopSpeaking();
      this.errorSubject.next(null);

      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      let settled = false;
      const session: RecognitionSession = {
        recognition,
        stopRequested: false,
        finish: () => undefined,
      };

      const cleanup = (): void => {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      };
      const release = (): void => {
        cleanup();
        if (this.activeRecognition === session) this.activeRecognition = null;
        this.listeningSubject.next(false);
      };
      const complete = (): void => {
        if (settled) return;
        settled = true;
        release();
        subscriber.complete();
      };
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        this.errorSubject.next(message);
        release();
        subscriber.error(new Error(message));
      };
      session.finish = complete;

      recognition.onstart = () => {
        if (this.activeRecognition !== session) return;
        this.listeningSubject.next(true);
      };
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results.item(index);
          if (result.isFinal) finalTranscript += `${result.item(0).transcript} `;
        }
      };
      recognition.onerror = (event) => {
        if (session.stopRequested && event.error === 'aborted') {
          complete();
          return;
        }
        fail(this.recognitionErrorMessage(event.error));
      };
      recognition.onend = () => {
        if (settled) return;
        const transcript = finalTranscript.trim();
        if (transcript) subscriber.next(transcript);
        if (!transcript && !session.stopRequested) {
          fail('No speech was detected. Check your microphone and try again.');
          return;
        }
        complete();
      };

      this.activeRecognition = session;
      try {
        recognition.start();
      } catch {
        fail('The microphone could not be started. Check browser permissions and try again.');
      }

      return () => {
        if (settled) return;
        settled = true;
        release();
        recognition.abort();
      };
    });
  }

  /** Requests a graceful stop so the browser can return any final recognition result. */
  stopListening(): void {
    const session = this.activeRecognition;
    if (!session) return;
    session.stopRequested = true;
    this.listeningSubject.next(false);
    try {
      session.recognition.stop();
    } catch {
      session.finish();
    }
  }

  /** Reads text with an available English voice, falling back to the browser default. */
  speak(text: string): void {
    const content = text.trim();
    if (!content) return;
    if (!this.synthesisSupported) {
      this.errorSubject.next('Speech playback is not supported in this browser.');
      return;
    }

    this.stopListening();
    this.stopSpeaking();
    this.errorSubject.next(null);

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'en-US';
    const voice = this.englishVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (this.activeUtterance === utterance) this.speakingSubject.next(true);
    };
    utterance.onend = () => this.finishUtterance(utterance);
    utterance.onerror = (event) => {
      this.finishUtterance(utterance);
      if (event.error !== 'canceled' && event.error !== 'interrupted')
        this.errorSubject.next('The browser could not read this message aloud.');
    };

    this.activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /** Cancels current and queued speech synthesis. */
  stopSpeaking(): void {
    if (!this.synthesisSupported) return;
    if (this.activeUtterance) {
      this.activeUtterance.onstart = null;
      this.activeUtterance.onend = null;
      this.activeUtterance.onerror = null;
      this.activeUtterance = null;
    }
    window.speechSynthesis.cancel();
    this.speakingSubject.next(false);
  }

  private recognitionConstructor(): SpeechRecognitionConstructor | null {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  private recognitionErrorMessage(code: string): string {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone permission was denied. Allow microphone access in browser settings.';
      case 'no-speech':
        return 'No speech was detected. Check your microphone and try again.';
      case 'audio-capture':
        return 'No working microphone was found. Check your audio input device.';
      case 'network':
        return 'The browser speech service is unavailable. Check your connection and try again.';
      default:
        return 'Speech recognition stopped unexpectedly. Please try again.';
    }
  }

  private englishVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => voice.lang.toLowerCase() === 'en-us') ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ??
      voices.find((voice) => voice.default) ??
      voices[0] ??
      null
    );
  }

  private finishUtterance(utterance: SpeechSynthesisUtterance): void {
    if (this.activeUtterance !== utterance) return;
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
    this.activeUtterance = null;
    this.speakingSubject.next(false);
  }
}
