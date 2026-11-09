import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PROTECTED = ['/dashboard', '/organisations', '/subscriptions', '/users', '/health'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;
  const isSuperAdmin =
    token?.role === 'SUPER_ADMIN' &&
    token.error !== 'RefreshAccessTokenError' &&
    token.orgType === null;

  if (pathname === '/admin/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (pathname === '/admin/dashboard') {
    return NextResponse.redirect(new URL(isSuperAdmin ? '/dashboard' : '/login', request.url));
  }

  const isLogin = pathname === '/login';
  const isProtected = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isSuperAdmin) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isLogin && isSuperAdmin) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/admin/login',
    '/admin/dashboard',
    '/dashboard',
    '/dashboard/:path*',
    '/organisations',
    '/organisations/:path*',
    '/subscriptions',
    '/subscriptions/:path*',
    '/users',
    '/users/:path*',
    '/health',
    '/health/:path*',
  ],
};
