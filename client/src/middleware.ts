// client/src/middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn   = !!req.auth;
  const isLoginPage  = pathname === '/login';
  const isHostPage   = pathname.startsWith('/host') || pathname.startsWith('/studio');
  const isApiAuth    = pathname.startsWith('/api/auth');
  const isCoHost     = pathname.startsWith('/cohost');   // ← FIX: allow co-host pages through

  // Always allow: auth API routes and co-host invite pages
  if (isApiAuth || isCoHost) return NextResponse.next();

  // Redirect logged-in users away from login page
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/host', req.nextUrl));
  }

  // Protect /host — redirect to login if not authenticated
  if (!isLoggedIn && isHostPage) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|og-image.png).*)'],
};
