// client/src/middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isHostPage = req.nextUrl.pathname.startsWith('/host');
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth');

  // Allow auth API routes through always
  if (isApiAuth) return NextResponse.next();

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