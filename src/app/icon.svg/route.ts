import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/public/branding/icon?size=512&v=icon', request.url));
}
