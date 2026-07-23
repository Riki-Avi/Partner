import { Router } from 'express';
import { conversationsController } from '../controllers/conversations.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const conversationsRouter = Router();
conversationsRouter.use(authMiddleware);
conversationsRouter.get('/', conversationsController.list.bind(conversationsController));
conversationsRouter.post('/', conversationsController.create.bind(conversationsController));
conversationsRouter.get(
  '/:conversationId/messages',
  conversationsController.messages.bind(conversationsController),
);
