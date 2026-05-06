import 'server-only';
import { cookies } from 'next/headers';
import { adminAuth } from './firebase-admin';
import { SESSION_COOKIE } from './constants';
import type { AuthUser } from './types';

/**
 * Resolve the current user from the `__session` cookie. Returns null when the
 * cookie is missing/invalid/expired; callers in server components should
 * `redirect('/login')` and route handlers should `return 401`.
 *
 * `checkRevoked: true` defends against tokens issued before a forced sign-out.
 * It costs an extra Firebase Auth round-trip per call; if that ever shows up
 * in profiling, layer a per-request memo in front (e.g. via React.cache).
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      picture: (decoded.picture as string | undefined) ?? null,
    };
  } catch {
    // Either expired or revoked — treat as signed out.
    return null;
  }
}

/**
 * Helper for API routes — returns the user or throws an Error whose `.code`
 * is `'UNAUTHENTICATED'` so the route can convert it to a 401 response.
 */
export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) {
    const e = new Error('Bạn cần đăng nhập để thực hiện thao tác này.');
    (e as Error & { code: string }).code = 'UNAUTHENTICATED';
    throw e;
  }
  return u;
}
