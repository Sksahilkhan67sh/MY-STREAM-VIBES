// client/src/middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn   = !!req.auth;
  const isLoginPage  = pathname === '/login';
  // Protect /studio (new), /host (legacy redirect), and /s/[roomId] (watching
  // a stream now requires sign-in — see token.ts for why) behind auth.
  const isProtected  = pathname.startsWith('/studio') || pathname.startsWith('/host') || pathname.startsWith('/s/');
  const isApiAuth    = pathname.startsWith('/api/auth');
  const isCoHost     = pathname.startsWith('/cohost');

  // Always allow: auth API routes and co-host invite pages
  if (isApiAuth || isCoHost) return NextResponse.next();

  // Redirect logged-in users away from login page. Send them to "/" rather
  // than hardcoding "/studio" — middleware has no Postgres access and can't
  // check `role` (role lives in the DB, not the JWT; see useUserRole.ts), so
  // it can never know whether this user is a Viewer or a Creator. "/" already
  // contains the correct role-aware redirect (role exists → /feed or
  // /studio/create-channel as appropriate; no role yet → /onboarding, shown
  // exactly once) — see app/page.tsx. Hardcoding /studio here used to send
  // viewers into creator-only territory on every single login, which is what
  // produced the "asked to choose a role multiple times" symptom.
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  // Protect /studio, /host, and /s/[roomId] — redirect to login if not
  // authenticated, carrying the original destination as callbackUrl so the
  // visitor lands back where they meant to go (e.g. the stream they clicked).
  if (!isLoggedIn && isProtected) {
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|og-image.png).*)'],
};
