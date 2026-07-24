import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.middleware.js';
import { databaseService } from '../services/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TITLE = 'English practice';
const MAX_TITLE_LENGTH = 120;

function requestBody(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

function conversationIdFrom(req: AuthenticatedRequest): string {
  const conversationId = req.params['conversationId'];
  if (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId))
    throw new ValidationError('A valid conversation identifier is required');
  return conversationId;
}

function validatedTitle(value: unknown, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') throw new ValidationError('Title must be a string');
  const title = value.trim();
  if (!title || title.length > MAX_TITLE_LENGTH)
    throw new ValidationError(`Title must contain 1-${MAX_TITLE_LENGTH} characters`);
  return title;
}

/** Handles authenticated conversation-history and management REST operations. */
export class ConversationsController {
  /** Lists conversations owned by the authenticated user. */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversations = await databaseService.getUserConversations(req.userId);
      res.json({ success: true, data: conversations });
    } catch (error) {
      next(error);
    }
  }

  /** Creates a conversation owned by the authenticated user. */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body as unknown);
      const languageValue = body['language'];
      if (languageValue !== undefined && typeof languageValue !== 'string')
        throw new ValidationError('Language must be a string');
      const language = typeof languageValue === 'string' ? languageValue.trim() || 'en' : 'en';
      if (language.length > 50)
        throw new ValidationError('Language must be 50 characters or fewer');
      const title = validatedTitle(body['title'], DEFAULT_TITLE);
      const conversation = await databaseService.createConversation(req.userId, language, title);
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  /** Renames an owned conversation. */
  async rename(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversationId = conversationIdFrom(req);
      const body = requestBody(req.body as unknown);
      const title = validatedTitle(body['title']);
      const conversation = await databaseService.renameOwnedConversation(
        conversationId,
        req.userId,
        title,
      );
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  /** Ends an owned conversation using server-derived duration. */
  async end(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversation = await databaseService.endOwnedConversation(
        conversationIdFrom(req),
        req.userId,
      );
      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  /** Deletes an owned conversation and its cascading history. */
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversationId = conversationIdFrom(req);
      await databaseService.deleteOwnedConversation(conversationId, req.userId);
      res.json({ success: true, data: { conversationId } });
    } catch (error) {
      next(error);
    }
  }

  /** Returns stable chronological messages when the authenticated user owns the conversation. */
  async messages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const messages = await databaseService.getOwnedConversationMessages(
        conversationIdFrom(req),
        req.userId,
      );
      res.json({ success: true, data: messages });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationsController = new ConversationsController();
