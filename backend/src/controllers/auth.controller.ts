import type { NextFunction, Request, Response } from 'express';
import type { LoginRequest, SignupRequest } from '@voice-chat/shared';
import { supabase } from '../config/supabase.config.js';
import { databaseService } from '../services/database.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../middleware/error.middleware.js';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export class AuthController {
  /**
   * Creates Supabase Auth and profile records, rolling Auth back if profile creation fails.
   * @param req Express request containing email, password, and name in its body.
   * @param res Express response used to return the created user and bearer token.
   * @param next Error callback that receives validation, conflict, authentication, or database errors.
   * @returns A promise that resolves after sending the response or forwarding an error.
   */
  async signup(
    req: Request<object, object, SignupRequest>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { email, password, name } = req.body;
      if (!email || !validEmail(email) || !name?.trim() || !password || password.length < 8)
        throw new ValidationError(
          'Valid email, name, and password of at least 8 characters are required',
        );
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (/already|registered|exists/i.test(error.message))
          throw new ConflictError('A user with this email already exists');
        throw new ValidationError(error.message);
      }
      if (!data.user || !data.session)
        throw new UnauthorizedError(
          'Signup requires email confirmation or did not create a session',
        );
      try {
        const user = await databaseService.createUser(data.user.id, email, name.trim());
        await databaseService.createUserProgress(data.user.id);
        res.status(201).json({ success: true, data: { user, token: data.session.access_token } });
      } catch (profileError) {
        await supabase.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticates credentials and returns the matching profile and bearer token.
   * @param req Express request containing email and password in its body.
   * @param res Express response used to return authentication data.
   * @param next Error callback that receives validation, authentication, or missing-profile errors.
   * @returns A promise that resolves after sending the response or forwarding an error.
   */
  async login(
    req: Request<object, object, LoginRequest>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) throw new ValidationError('Email and password are required');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user)
        throw new UnauthorizedError('Invalid email or password');
      const user = await databaseService.getUser(data.user.id);
      if (!user) throw new NotFoundError('User profile not found');
      res.json({ success: true, data: { user, token: data.session.access_token } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Invalidates the access token attached by the authentication middleware.
   * @param req Authenticated request containing the verified access token.
   * @param res Express response used to confirm logout.
   * @param next Error callback that receives missing-token or invalidation errors.
   * @returns A promise that resolves after sending the response or forwarding an error.
   */
  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.accessToken) throw new UnauthorizedError('No token provided');
      const { error } = await supabase.auth.admin.signOut(req.accessToken);
      if (error) throw new UnauthorizedError('Unable to invalidate session');
      res.json({ success: true, data: null, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Returns the profile associated with the verified request identity.
   * @param req Authenticated request containing the verified user identifier.
   * @param res Express response used to return the user profile.
   * @param next Error callback that receives authentication, missing-profile, or database errors.
   * @returns A promise that resolves after sending the response or forwarding an error.
   */
  async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const user = await databaseService.getUser(req.userId);
      if (!user) throw new NotFoundError('User profile not found');
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Creates a fresh temporary guest user starting from zero and returns authentication data.
   */
  async loginAsGuest(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const guestRand = Math.random().toString(36).substring(2, 8);
      const email = `guest_${Date.now()}_${guestRand}@guest.voicechat.local`;
      const password = `Guest_${Math.random().toString(36).substring(2, 12)}!9A`;
      const name = 'Guest Learner';

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_guest: true },
      });

      if (error || !data.user) {
        throw new UnauthorizedError(`Unable to create guest session: ${error?.message}`);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (sessionError || !sessionData.session) {
        throw new UnauthorizedError('Unable to generate guest session token');
      }

      const user = await databaseService.createUser(data.user.id, email, name);
      await databaseService.createUserProgress(data.user.id);
      await databaseService.upsertUserPreferences(data.user.id, {
        interests: ['everyday-life', 'culture', 'technology', 'movies'],
        goals: ['casual-fluency'],
        tone: 'friendly',
      });

      res.status(201).json({
        success: true,
        data: {
          user,
          token: sessionData.session.access_token,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
export const authController = new AuthController();
