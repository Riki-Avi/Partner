import type { NextFunction, Response } from 'express';
import type { ReviewCorrectionRequest } from '@voice-chat/shared';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.middleware.js';
import {
  databaseService,
  type CorrectionQuery,
  type CorrectionReviewChanges,
  type CorrectionReviewStatus,
} from '../services/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_STATUSES: readonly CorrectionReviewStatus[] = ['all', 'pending', 'mastered'];
const MAX_ERROR_TYPE_LENGTH = 100;
const MAX_PAGE_SIZE = 200;

function requestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

function correctionIdFrom(req: AuthenticatedRequest): string {
  const correctionId = req.params['correctionId'];
  if (typeof correctionId !== 'string' || !UUID_PATTERN.test(correctionId))
    throw new ValidationError('A valid correction identifier is required');
  return correctionId;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Parses a bounded, non-negative integer query parameter.
 * @param value Raw query value.
 * @param name Parameter name used in the validation message.
 * @param max Inclusive upper bound, or `undefined` for no bound.
 * @returns The parsed number, or `undefined` when the parameter was absent.
 * @throws {ValidationError} If the value is present but not a valid bounded integer.
 */
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

/** Serves the learner's saved corrections for later study and records their review progress. */
export class CorrectionsController {
  /** Lists the authenticated user's corrections, newest first. */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');

      const requestedStatus = firstQueryValue(req.query['status'])?.trim().toLowerCase();
      if (requestedStatus && !REVIEW_STATUSES.includes(requestedStatus as CorrectionReviewStatus))
        throw new ValidationError(`Status must be one of: ${REVIEW_STATUSES.join(', ')}`);

      const errorType = firstQueryValue(req.query['errorType'])?.trim();
      if (errorType && errorType.length > MAX_ERROR_TYPE_LENGTH)
        throw new ValidationError(
          `Error type must be ${MAX_ERROR_TYPE_LENGTH} characters or fewer`,
        );

      const query: CorrectionQuery = {
        status: (requestedStatus as CorrectionReviewStatus | undefined) ?? 'all',
      };
      if (errorType) query.errorType = errorType;
      const limit = integerQuery(req.query['limit'], 'Limit', MAX_PAGE_SIZE);
      if (limit !== undefined) query.limit = limit;
      const offset = integerQuery(req.query['offset'], 'Offset');
      if (offset !== undefined) query.offset = offset;

      const corrections = await databaseService.getOwnedCorrections(req.userId, query);
      res.json({ success: true, data: corrections });
    } catch (error) {
      next(error);
    }
  }

  /** Summarizes how many corrections are pending, mastered, and of each error type. */
  async stats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const stats = await databaseService.getOwnedCorrectionStats(req.userId);
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  /** Records a practice attempt and/or moves a correction in or out of the pending pile. */
  async review(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const correctionId = correctionIdFrom(req);
      const body = requestBody(req.body as unknown) as ReviewCorrectionRequest;
      const reviewed = optionalBoolean(body.reviewed, 'Reviewed');
      const mastered = optionalBoolean(body.mastered, 'Mastered');
      if (reviewed === undefined && mastered === undefined)
        throw new ValidationError('Provide reviewed, mastered, or both');

      const changes: CorrectionReviewChanges = {};
      if (reviewed !== undefined) changes.reviewed = reviewed;
      if (mastered !== undefined) changes.mastered = mastered;

      const correction = await databaseService.reviewOwnedCorrection(
        correctionId,
        req.userId,
        changes,
      );
      res.json({ success: true, data: correction });
    } catch (error) {
      next(error);
    }
  }
}

export const correctionsController = new CorrectionsController();
