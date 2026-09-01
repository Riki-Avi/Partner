import { Router } from 'express';
import { correctionsController } from '../controllers/corrections.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const correctionsRouter = Router();
correctionsRouter.use(authMiddleware);
correctionsRouter.get('/', correctionsController.list.bind(correctionsController));
correctionsRouter.get('/stats', correctionsController.stats.bind(correctionsController));
correctionsRouter.patch('/:correctionId', correctionsController.review.bind(correctionsController));
