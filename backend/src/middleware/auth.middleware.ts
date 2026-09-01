import type { NextFunction, Request, Response } from 'express';
import { authBypassEnabled, resolveBypassUserId } from '../config/dev-auth.config.js';
import { supabase } from '../config/supabase.config.js';
import { UnauthorizedError } from './error.middleware.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
}

/**
 * Verifies a Supabase bearer token and attaches its user identity to the request.
 *
 * When `AUTH_BYPASS` is enabled the token is not inspected and the request is attributed to the
 * development user instead. `accessToken` stays unset in that mode because no session exists.
 * @param req Express request whose Authorization header contains a bearer token.
 * @param _res Unused Express response; successful requests continue through `next`.
 * @param next Callback invoked without arguments on success or with an `UnauthorizedError` on failure.
 * @returns A promise that resolves after verification and middleware dispatch.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Development bypass: attribute the request to a fixed user without inspecting the token.
    if (authBypassEnabled) {
      req.userId = await resolveBypassUserId();
      next();
      return;
    }

    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedError('No token provided');
    const token = authorization.slice(7).trim();
    if (!token) throw new UnauthorizedError('No token provided');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedError('Invalid or expired token');
    req.userId = data.user.id;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}
