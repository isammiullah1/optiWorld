import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { dashboardPathForSession, routePrefixForOrgType } from '@optiworld/shared';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login';
  const isProtected =
    pathname.startsWith('/retailer') ||
    pathname.startsWith('/wholesaler') ||
    pathname.startsWith('/laboratory');

  if (token?.role === 'SUPER_ADMIN') {
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';
    return NextResponse.redirect(new URL('/login', adminUrl));
  }

  if (isProtected && (!token || token.error === 'RefreshAccessTokenError')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && isProtected) {
    const prefix = routePrefixForOrgType(token.orgType);
    if (!prefix || !pathname.startsWith(prefix)) {
      return NextResponse.redirect(new URL(dashboardPathForSession(token), request.url));
    }
  }

  if (token && isLogin) {
    return NextResponse.redirect(new URL(dashboardPathForSession(token), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/retailer/:path*', '/wholesaler/:path*', '/laboratory/:path*'],
};
