import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/public/branding/icon?size=192&v=apple-touch-icon', request.url));
}
