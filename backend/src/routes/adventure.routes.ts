import { Router } from 'express';
import { adventureController } from '../controllers/adventure.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const adventureRouter = Router();

adventureRouter.use(authMiddleware);

adventureRouter.get('/current', (req, res, next) => adventureController.getCurrent(req, res, next));
adventureRouter.post('/turn', (req, res, next) => adventureController.sendTurn(req, res, next));
adventureRouter.post('/reset', (req, res, next) =>
  adventureController.resetAdventure(req, res, next),
);
