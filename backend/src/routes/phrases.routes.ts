import { Router } from 'express';
import { phrasesController } from '../controllers/phrases.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const phrasesRouter = Router();
phrasesRouter.use(authMiddleware);
phrasesRouter.get('/', phrasesController.list.bind(phrasesController));
phrasesRouter.post('/', phrasesController.create.bind(phrasesController));
phrasesRouter.get('/stats', phrasesController.stats.bind(phrasesController));
phrasesRouter.post('/:phraseId/translate', phrasesController.translate.bind(phrasesController));
phrasesRouter.patch('/:phraseId', phrasesController.update.bind(phrasesController));
phrasesRouter.delete('/:phraseId', phrasesController.delete.bind(phrasesController));
