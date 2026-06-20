import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

function normalizeHostname(host: string) {
  return host.split(':')[0].toLowerCase().replace(/^www\./, '');
}

function isInternalPath(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/store/manifest.webmanifest' ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/favicon.ico' || pathname === '/icon.svg' || pathname === '/apple-touch-icon.png') {
    const url = request.nextUrl.clone();
    url.pathname = '/api/public/branding/icon';
    url.searchParams.set('size', pathname === '/icon.svg' ? '512' : '192');
    url.searchParams.set('v', pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'icon');
    return NextResponse.rewrite(url);
  }

  if (isInternalPath(pathname)) return NextResponse.next();

  const hostname = normalizeHostname(request.headers.get('host') || '');
  const isAdminDomain = hostname.startsWith('admin.');
  const isStoreDomain = hostname.startsWith('store.');

  if (isStoreDomain && pathname !== '/store' && !pathname.startsWith('/store/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/store';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isAdminDomain && (pathname === '/' || pathname === '/store')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)']
};
