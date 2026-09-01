import { AppError } from '../middleware/error.middleware.js';
import { supabase } from './supabase.config.js';

const DEFAULT_BYPASS_EMAIL = 'test@example.com';

/**
 * Reads the development authentication bypass flag.
 *
 * The check runs at module load so a misconfigured deployment fails on startup instead of silently
 * serving every request as one user. Enabling the bypass in production is refused outright.
 */
function readBypassFlag(): boolean {
  const requested = process.env['AUTH_BYPASS']?.trim().toLowerCase();
  if (requested !== 'true' && requested !== '1') return false;
  if (process.env['NODE_ENV'] === 'production')
    throw new Error(
      'AUTH_BYPASS must not be enabled while NODE_ENV=production. Remove AUTH_BYPASS before deploying.',
    );
  return true;
}

/** Whether every REST and socket request should be attributed to a fixed development user. */
export const authBypassEnabled = readBypassFlag();

if (authBypassEnabled) {
  const rule = '='.repeat(78);
  console.warn(rule);
  console.warn('AUTH_BYPASS IS ENABLED. Login is disabled and tokens are ignored.');
  console.warn('Every REST and socket request is served as the development user.');
  console.warn('Anyone who can reach this port has full access to that account.');
  console.warn('Never enable this on a shared, tunnelled, or deployed backend.');
  console.warn(rule);
}

let cachedUserId: string | null = null;

/**
 * Resolves the development user whose identity replaces real authentication.
 *
 * The identifier is looked up by email once and cached, so the bypass reuses an existing profile
 * row and every ownership check downstream keeps working unchanged.
 * @returns The development user's identifier.
 * @throws {AppError} If the bypass user cannot be found, with guidance on how to create it.
 */
export async function resolveBypassUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const email = process.env['AUTH_BYPASS_EMAIL']?.trim() || DEFAULT_BYPASS_EMAIL;
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error)
    throw new AppError(
      `AUTH_BYPASS could not look up "${email}": ${error.message}`,
      503,
      'AUTH_BYPASS_MISCONFIGURED',
    );
  if (!data)
    throw new AppError(
      `AUTH_BYPASS user "${email}" does not exist. Run "npm run seed" to create it, or point AUTH_BYPASS_EMAIL at an existing user.`,
      503,
      'AUTH_BYPASS_MISCONFIGURED',
    );

  cachedUserId = (data as { id: string }).id;
  console.info(`AUTH_BYPASS resolved "${email}" to user ${cachedUserId}.`);
  return cachedUserId;
}
