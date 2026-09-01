import type { NextFunction, Response } from 'express';
import type { SynthesizeSpeechRequest, TranscribeSpeechData } from '@voice-chat/shared';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AppError, UnauthorizedError, ValidationError } from '../middleware/error.middleware.js';
import { elevenLabsService } from '../services/elevenlabs.service.js';

const MAX_SPEECH_TEXT_LENGTH = 4_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SYNTHESIZE_RATE_LIMIT = 12;
const TRANSCRIBE_RATE_LIMIT = 20;

/** Upload ceiling for a dictation clip. Must stay in sync with the route's body-parser limit. */
export const MAX_TRANSCRIPTION_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Recorder containers accepted for transcription. Browsers disagree on what they produce:
 * Chromium records WebM/Opus while Safari records MP4/AAC, and some report the WebM container
 * under a `video/` type even for audio-only tracks.
 */
export const TRANSCRIPTION_CONTENT_TYPES: readonly string[] = [
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'application/ogg',
  'audio/mp4',
  'video/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
];

/**
 * Scribe rejects clips shorter than 100ms. A small floor turns an accidental click into a friendly
 * message instead of a provider error.
 */
const MIN_TRANSCRIPTION_UPLOAD_BYTES = 1_024;

interface RateWindow {
  startedAt: number;
  requests: number;
}

function requestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

/** Generates and transcribes authenticated, transient speech without exposing provider credentials. */
export class SpeechController {
  private readonly rateWindows = new Map<string, RateWindow>();

  /** Converts assistant text into transient audio the browser can play immediately. */
  async synthesize(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body as unknown);
      const textValue = (body as Partial<SynthesizeSpeechRequest>).text;
      if (typeof textValue !== 'string') throw new ValidationError('Text must be a string');
      const text = textValue.trim();
      if (!text || text.length > MAX_SPEECH_TEXT_LENGTH)
        throw new ValidationError(`Text must contain 1-${MAX_SPEECH_TEXT_LENGTH} characters`);

      this.enforceRateLimit('synthesize', req.userId, SYNTHESIZE_RATE_LIMIT);
      const speech = await elevenLabsService.synthesize(text);
      res
        .status(200)
        .set({
          'Cache-Control': 'private, no-store',
          'Content-Length': String(speech.audio.length),
          'Content-Type': speech.contentType,
          'X-Content-Type-Options': 'nosniff',
        })
        .send(speech.audio);
    } catch (error) {
      next(error);
    }
  }

  /** Turns a recorded dictation clip into text without persisting the audio. */
  async transcribe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');

      const audio = req.body as unknown;
      if (!Buffer.isBuffer(audio))
        throw new ValidationError(
          `Request body must be recorded audio with one of these content types: ${TRANSCRIPTION_CONTENT_TYPES.join(', ')}`,
        );
      if (audio.length < MIN_TRANSCRIPTION_UPLOAD_BYTES)
        throw new ValidationError('The recording is too short to transcribe');
      if (audio.length > MAX_TRANSCRIPTION_UPLOAD_BYTES)
        throw new AppError(
          'The recording is too large to transcribe',
          413,
          'SPEECH_UPLOAD_TOO_LARGE',
        );

      const contentType = req.get('content-type')?.trim();
      if (!contentType) throw new ValidationError('A recording content type is required');

      this.enforceRateLimit('transcribe', req.userId, TRANSCRIBE_RATE_LIMIT);
      const text = await elevenLabsService.transcribe(audio, contentType);
      const data: TranscribeSpeechData = { text };
      res.status(200).set({ 'Cache-Control': 'private, no-store' }).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  private enforceRateLimit(action: string, userId: string, limit: number): void {
    const key = `${action}:${userId}`;
    const now = Date.now();
    const current = this.rateWindows.get(key);
    if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
      this.rateWindows.set(key, { startedAt: now, requests: 1 });
      this.removeExpiredRateWindows(now);
      return;
    }
    if (current.requests >= limit)
      throw new AppError(
        'Too many voice requests. Wait a minute and try again.',
        429,
        'SPEECH_RATE_LIMITED',
      );
    current.requests += 1;
  }

  private removeExpiredRateWindows(now: number): void {
    if (this.rateWindows.size < 1_000) return;
    for (const [key, rateWindow] of this.rateWindows) {
      if (now - rateWindow.startedAt >= RATE_LIMIT_WINDOW_MS) this.rateWindows.delete(key);
    }
  }
}

export const speechController = new SpeechController();
