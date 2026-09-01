import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../middleware/error.middleware.js';
import {
  databaseService,
  type PhraseQuery,
  type PhraseReviewChanges,
  type PhraseStatus,
} from '../services/database.service.js';
import { geminiService } from '../services/gemini.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHRASE_STATUSES: readonly PhraseStatus[] = ['all', 'pending', 'mastered', 'untranslated'];
const MAX_PHRASE_LENGTH = 1_000;
const MAX_NOTE_LENGTH = 500;
const MAX_PAGE_SIZE = 200;

function requestBody(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

function phraseIdFrom(req: AuthenticatedRequest): string {
  const phraseId = req.params['phraseId'];
  if (typeof phraseId !== 'string' || !UUID_PATTERN.test(phraseId))
    throw new ValidationError('A valid phrase identifier is required');
  return phraseId;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function integerQuery(value: unknown, name: string, max?: number): number | undefined {
  const raw = firstQueryValue(value)?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new ValidationError(`${name} must be a non-negative integer`);
  if (max !== undefined && parsed > max)
    throw new ValidationError(`${name} must be ${max} or less`);
  return parsed;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be a boolean`);
  return value;
}

/**
 * Parses the optional note field, distinguishing "leave it alone" from "clear it".
 * @returns `undefined` when absent, `null` when explicitly cleared, otherwise the trimmed note.
 */
function optionalNote(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Note must be a string or null');
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH)
    throw new ValidationError(`Note must be ${MAX_NOTE_LENGTH} characters or fewer`);
  return note || null;
}

/** Manages the learner's phrase notebook: capture now, translate and study later. */
export class PhrasesController {
  /** Saves a phrase without translating it, so capturing stays instant. */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body as unknown);
      const contentValue = body['content'];
      if (typeof contentValue !== 'string') throw new ValidationError('Content must be a string');
      const content = contentValue.trim();
      if (!content || content.length > MAX_PHRASE_LENGTH)
        throw new ValidationError(`Content must contain 1-${MAX_PHRASE_LENGTH} characters`);

      const note = optionalNote(body['note']);
      const phrase = await databaseService.createOwnedPhrase(
        req.userId,
        content,
        note ?? undefined,
      );
      res.status(201).json({ success: true, data: phrase });
    } catch (error) {
      next(error);
    }
  }

  /** Lists saved phrases, newest first. */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');

      const requestedStatus = firstQueryValue(req.query['status'])?.trim().toLowerCase();
      if (requestedStatus && !PHRASE_STATUSES.includes(requestedStatus as PhraseStatus))
        throw new ValidationError(`Status must be one of: ${PHRASE_STATUSES.join(', ')}`);

      const query: PhraseQuery = { status: (requestedStatus as PhraseStatus | undefined) ?? 'all' };
      const limit = integerQuery(req.query['limit'], 'Limit', MAX_PAGE_SIZE);
      if (limit !== undefined) query.limit = limit;
      const offset = integerQuery(req.query['offset'], 'Offset');
      if (offset !== undefined) query.offset = offset;

      const phrases = await databaseService.getOwnedPhrases(req.userId, query);
      res.json({ success: true, data: phrases });
    } catch (error) {
      next(error);
    }
  }

  /** Summarizes how many phrases are pending, mastered, and still untranslated. */
  async stats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const stats = await databaseService.getOwnedPhraseStats(req.userId);
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Translates a saved phrase and caches the result.
   *
   * Already-translated phrases are returned untouched so a repeated tap costs nothing and cannot
   * overwrite a translation the learner has been studying.
   */
  async translate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const phraseId = phraseIdFrom(req);
      const existing = await databaseService.getOwnedPhrase(phraseId, req.userId);
      if (!existing) throw new NotFoundError('Phrase not found');
      if (existing.translation) {
        res.json({ success: true, data: existing });
        return;
      }

      const translation = await geminiService.translatePhrase(existing.content);
      const phrase = await databaseService.saveOwnedPhraseTranslation(
        phraseId,
        req.userId,
        translation,
      );
      res.json({ success: true, data: phrase });
    } catch (error) {
      next(error);
    }
  }

  /** Records a practice attempt, retires a phrase, or edits its note. */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const phraseId = phraseIdFrom(req);
      const body = requestBody(req.body as unknown);

      const changes: PhraseReviewChanges = {};
      const note = optionalNote(body['note']);
      if (note !== undefined) changes.note = note;
      const reviewed = optionalBoolean(body['reviewed'], 'Reviewed');
      if (reviewed !== undefined) changes.reviewed = reviewed;
      const mastered = optionalBoolean(body['mastered'], 'Mastered');
      if (mastered !== undefined) changes.mastered = mastered;
      if (Object.keys(changes).length === 0)
        throw new ValidationError('Provide note, reviewed, or mastered');

      const phrase = await databaseService.reviewOwnedPhrase(phraseId, req.userId, changes);
      res.json({ success: true, data: phrase });
    } catch (error) {
      next(error);
    }
  }

  /** Deletes a saved phrase. */
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const phraseId = phraseIdFrom(req);
      await databaseService.deleteOwnedPhrase(phraseId, req.userId);
      res.json({ success: true, data: { phraseId } });
    } catch (error) {
      next(error);
    }
  }
}

export const phrasesController = new PhrasesController();
