import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const authRouter = Router();
authRouter.post('/signup', authController.signup.bind(authController));
authRouter.post('/login', authController.login.bind(authController));
authRouter.post('/guest', authController.loginAsGuest.bind(authController));
authRouter.post('/logout', authMiddleware, authController.logout.bind(authController));
authRouter.get('/me', authMiddleware, authController.getMe.bind(authController));
