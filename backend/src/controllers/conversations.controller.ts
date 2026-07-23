import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.middleware.js';
import { databaseService } from '../services/database.service.js';

/** Handles authenticated conversation-history REST operations. */
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
      const body: unknown = req.body;
      if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body)))
        throw new ValidationError('Request body must be an object');
      const languageValue =
        body && 'language' in body ? (body as { language?: unknown }).language : undefined;
      if (languageValue !== undefined && typeof languageValue !== 'string')
        throw new ValidationError('Language must be a string');
      const language = languageValue?.trim() || 'en';
      if (language.length > 50)
        throw new ValidationError('Language must be 50 characters or fewer');
      const conversation = await databaseService.createConversation(req.userId, language);
      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  /** Returns stable chronological messages when the authenticated user owns the conversation. */
  async messages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversationId = req.params['conversationId'];
      if (typeof conversationId !== 'string' || !conversationId)
        throw new ValidationError('Conversation identifier is required');
      const messages = await databaseService.getOwnedConversationMessages(
        conversationId,
        req.userId,
      );
      res.json({ success: true, data: messages });
    } catch (error) {
      next(error);
    }
  }
}

export const conversationsController = new ConversationsController();
