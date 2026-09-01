import { Router } from 'express';
import { partnerController } from '../controllers/partner.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const partnerRouter = Router();
partnerRouter.use(authMiddleware);

partnerRouter.get('/summary', partnerController.getSummary.bind(partnerController));
partnerRouter.get('/preferences', partnerController.getPreferences.bind(partnerController));
partnerRouter.put('/preferences', partnerController.updatePreferences.bind(partnerController));
partnerRouter.get('/recommendations', partnerController.getRecommendations.bind(partnerController));
partnerRouter.post(
  '/recommendations/refresh',
  partnerController.refreshRecommendations.bind(partnerController),
);
partnerRouter.post(
  '/recommendations/:recommendationId/favorite',
  partnerController.toggleFavoriteRecommendation.bind(partnerController),
);
partnerRouter.post('/feedback', partnerController.saveFeedback.bind(partnerController));
partnerRouter.get(
  '/feedback/:conversationId',
  partnerController.getConversationFeedback.bind(partnerController),
);
