import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
} from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SessionBody = z.object({
  idToken: z.string().min(20),
});

/**
 * Exchange a freshly-minted Firebase ID token for an httpOnly session cookie.
 * The client signs in with `signInWithPopup`, gets an ID token, and POSTs it
 * here. We verify it, mint a session cookie scoped to the same user, and set
 * it as `Set-Cookie`. Subsequent server-side requests (route handlers, server
 * components) read the cookie and call `verifySessionCookie`.
 */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = SessionBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Thiếu hoặc sai định dạng idToken.' },
        { status: 400 },
      );
    }

    const auth = adminAuth();

    // Reject ID tokens older than 5 minutes — Firebase requires a recent
    // token to mint a session cookie anyway, but we surface a cleaner error.
    const decoded = await auth.verifyIdToken(parsed.data.idToken, true);
    const ageMs = Date.now() - decoded.auth_time * 1000;
    if (ageMs > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: 'ID token quá cũ. Vui lòng đăng nhập lại.' },
        { status: 401 },
      );
    }

    const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });

    const res = NextResponse.json({ ok: true, uid: decoded.uid });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(SESSION_COOKIE_MAX_AGE_MS / 1000),
    });
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('POST /api/auth/session failed', e);
    return NextResponse.json(
      { error: `Không xác minh được ID token: ${msg}` },
      { status: 401 },
    );
  }
}

/**
 * Sign-out: clear the cookie. We do NOT call `revokeRefreshTokens` here so the
 * user's other devices stay signed in. If you need a "log out everywhere"
 * action, expose it as a separate endpoint.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
