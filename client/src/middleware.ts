// client/src/middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn   = !!req.auth;
  const isLoginPage  = pathname === '/login';
  // Protect both /studio (new) and /host (legacy redirect) behind auth
  const isProtected  = pathname.startsWith('/studio') || pathname.startsWith('/host');
  const isApiAuth    = pathname.startsWith('/api/auth');
  const isCoHost     = pathname.startsWith('/cohost');

  // Always allow: auth API routes and co-host invite pages
  if (isApiAuth || isCoHost) return NextResponse.next();

  // Redirect logged-in users away from login page → studio
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/studio', req.nextUrl));
  }

  // Protect /studio and /host — redirect to login if not authenticated
  if (!isLoggedIn && isProtected) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|og-image.png).*)'],
};
