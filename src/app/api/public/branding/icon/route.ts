import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import type { Company, Settings } from '@/lib/dummy-data';
import {
  DEFAULT_BRANDING,
  type ActiveBranding,
  resolveBranding,
  resolveCompanyForBrandingHostname
} from '@/lib/branding/resolveBranding';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';

export const runtime = 'nodejs';

const ALLOWED_SIZES = new Set([72, 96, 128, 144, 152, 192, 384, 512]);

function parseSize(value: string | null) {
  const size = Number(value || 192);
  return ALLOWED_SIZES.has(size) ? size : 192;
}

async function loadFallbackIcon() {
  return fs.readFile(path.join(process.cwd(), 'public', 'printflowpro-mark.svg'));
}

function getInitials(value: string) {
  const words = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);

  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || 'APP').toUpperCase();
}

function createInitialsSvg(branding: ActiveBranding) {
  const initials = getInitials(branding.appName);
  const color = /^#[0-9a-f]{6}$/i.test(branding.themeColor) ? branding.themeColor : '#1D35C9';

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill="#F7F9FC"/>
      <rect x="40" y="40" width="432" height="432" rx="96" fill="${color}"/>
      <text x="256" y="294" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="178" font-weight="800" fill="#FFFFFF">${initials}</text>
    </svg>
  `);
}

function createSafeFallbackSvg(size: number) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#F7F9FC"/>
      <rect x="${Math.round(size * 0.08)}" y="${Math.round(size * 0.08)}" width="${Math.round(size * 0.84)}" height="${Math.round(size * 0.84)}" rx="${Math.round(size * 0.18)}" fill="#1D35C9"/>
      <text x="${size / 2}" y="${Math.round(size * 0.58)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(size * 0.32)}" font-weight="800" fill="#FFFFFF">PF</text>
    </svg>
  `);
}

async function loadImageSource(src: string | null) {
  if (!src) return loadFallbackIcon();

  if (src.startsWith('data:image/')) {
    const [, payload = ''] = src.split(',');
    return Buffer.from(payload, src.includes(';base64,') ? 'base64' : 'utf8');
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    const response = await fetch(src, { cache: 'no-store' });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }

  if (src.startsWith('/')) {
    return fs.readFile(path.join(process.cwd(), 'public', src.replace(/^\/+/, '')));
  }

  return loadFallbackIcon();
}

async function resolveActiveBrandingForIcon(request: NextRequest): Promise<ActiveBranding> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: companies } = await supabase
      .from('companies')
      .select('id,name,logo_url,logo_light,logo_dark,favicon,theme_color,admin_domain,store_domain,custom_domain,refund_policy');
    const activeCompany = resolveCompanyForBrandingHostname((companies || []) as Company[], request.headers.get('host') || request.nextUrl.hostname);
    if (!activeCompany) return DEFAULT_BRANDING;

    const { data: settingsRows } = await supabase
      .from('settings')
      .select('company_id,catalog_header_message,catalog_footer_text')
      .eq('company_id', activeCompany.id || '')
      .limit(1);
    return resolveBranding(activeCompany, settingsRows?.[0] as Partial<Settings> | undefined);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function GET(request: NextRequest) {
  const size = parseSize(request.nextUrl.searchParams.get('size'));

  try {
    const branding = await resolveActiveBrandingForIcon(request);
    let sourceImage: Buffer;

    try {
      sourceImage = branding.effectiveIconUrl
        ? await loadImageSource(branding.effectiveIconUrl)
        : branding.isPlatformFallback
          ? await loadFallbackIcon()
          : createInitialsSvg(branding);
    } catch {
      sourceImage = branding.isPlatformFallback ? await loadFallbackIcon() : createInitialsSvg(branding);
    }

    const png = await sharp(sourceImage)
      .resize(size, size, { fit: 'contain', background: { r: 247, g: 249, b: 252, alpha: 1 } })
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    try {
      const fallback = await sharp(await loadFallbackIcon())
        .resize(size, size)
        .png()
        .toBuffer();

      return new NextResponse(new Uint8Array(fallback), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store'
        }
      });
    } catch {
      return new NextResponse(new Uint8Array(createSafeFallbackSvg(size)), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-store'
        }
      });
    }
  }
}
