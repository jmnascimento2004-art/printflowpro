import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { Company, Settings } from '@/lib/dummy-data';
import {
  DEFAULT_BRANDING,
  resolveBranding,
  resolveCompanyForBrandingHostname
} from '@/lib/branding/resolveBranding';

export const runtime = 'nodejs';

const ALLOWED_SIZES = new Set([72, 96, 128, 144, 152, 192, 384, 512]);

function parseSize(value: string | null) {
  const size = Number(value || 192);
  return ALLOWED_SIZES.has(size) ? size : 192;
}

async function loadFallbackIcon() {
  return fs.readFile(path.join(process.cwd(), 'public', 'printflowpro-mark.svg'));
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

async function resolveIconUrl(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return DEFAULT_BRANDING.pwaIconUrl;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: companies } = await supabase
      .from('companies')
      .select('id,name,logo_url,logo_light,logo_dark,favicon,theme_color,admin_domain,store_domain,custom_domain,refund_policy');
    const activeCompany = resolveCompanyForBrandingHostname((companies || []) as Company[], request.headers.get('host') || request.nextUrl.hostname);
    if (!activeCompany) return DEFAULT_BRANDING.pwaIconUrl;

    const { data: settingsRows } = await supabase
      .from('settings')
      .select('company_id,catalog_header_message,catalog_footer_text')
      .eq('company_id', activeCompany.id || '')
      .limit(1);
    const branding = resolveBranding(activeCompany, settingsRows?.[0] as Partial<Settings> | undefined);
    return branding.pwaIconUrl || branding.logoUrl || branding.faviconUrl || DEFAULT_BRANDING.pwaIconUrl;
  } catch {
    return DEFAULT_BRANDING.pwaIconUrl;
  }
}

export async function GET(request: NextRequest) {
  const size = parseSize(request.nextUrl.searchParams.get('size'));

  try {
    const sourceImage = await loadImageSource(await resolveIconUrl(request));
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
  }
}
