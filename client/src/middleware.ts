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

  // Redirect logged-in users away from login page → studio
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/studio', req.nextUrl));
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
