import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const refreshToken = token?.refreshToken;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    await fetch(`${apiUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  }

  return NextResponse.json({ success: true, data: { revoked: true } });
}
