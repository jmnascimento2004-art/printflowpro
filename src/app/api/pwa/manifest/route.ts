import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Company, Settings } from '@/lib/dummy-data';
import {
  DEFAULT_BRANDING,
  resolveBranding,
  resolveCompanyForBrandingHostname
} from '@/lib/branding/resolveBranding';

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

function getParam(request: NextRequest, key: string, fallback: string) {
  return request.nextUrl.searchParams.get(key)?.trim() || fallback;
}

function safeHexColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function resolveIconSrc(request: NextRequest, size: number, resolvedIcon?: string | null) {
  const icon = resolvedIcon || request.nextUrl.searchParams.get('icon')?.trim();
  const usePublicBrandingIcon = request.nextUrl.searchParams.get('public_icon') === '1';
  if (usePublicBrandingIcon) {
    const version = request.nextUrl.searchParams.get('v')?.trim() || request.nextUrl.searchParams.get('slug')?.trim() || 'branding';
    return `/api/public/branding/icon?size=${size}&v=${encodeURIComponent(version)}`;
  }

  if (!icon) return `/icons/icon-${size}x${size}.png`;

  const absoluteIcon = new URL(icon, request.nextUrl.origin).href;
  return `/api/pwa/icon?src=${encodeURIComponent(absoluteIcon)}&size=${size}`;
}

async function resolveServerBranding(request: NextRequest) {
  const hasClientBranding = request.nextUrl.searchParams.has('name');
  if (hasClientBranding) {
    const appName = getParam(request, 'name', DEFAULT_BRANDING.appName);
    const iconUrl = request.nextUrl.searchParams.get('icon')?.trim() || null;
    return {
      appName,
      shortName: getParam(request, 'short_name', appName || DEFAULT_BRANDING.shortName),
      description: getParam(request, 'description', DEFAULT_BRANDING.description),
      themeColor: safeHexColor(getParam(request, 'theme_color', DEFAULT_BRANDING.themeColor), DEFAULT_BRANDING.themeColor),
      backgroundColor: safeHexColor(getParam(request, 'background_color', DEFAULT_BRANDING.backgroundColor), DEFAULT_BRANDING.backgroundColor),
      slug: request.nextUrl.searchParams.get('slug')?.trim() || 'printflowpro',
      iconUrl,
      version: request.nextUrl.searchParams.get('v')?.trim() || request.nextUrl.searchParams.get('slug')?.trim() || 'branding',
      usePublicBrandingIcon: request.nextUrl.searchParams.get('public_icon') === '1' || (!iconUrl && appName !== DEFAULT_BRANDING.appName)
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      appName: DEFAULT_BRANDING.appName,
      shortName: DEFAULT_BRANDING.shortName,
      description: DEFAULT_BRANDING.description,
      themeColor: DEFAULT_BRANDING.themeColor,
      backgroundColor: DEFAULT_BRANDING.backgroundColor,
      slug: 'printflowpro',
      iconUrl: DEFAULT_BRANDING.pwaIconUrl,
      version: DEFAULT_BRANDING.brandingVersion,
      usePublicBrandingIcon: true
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: companies } = await supabase
      .from('companies')
      .select('id,name,logo_url,logo_light,logo_dark,favicon,theme_color,admin_domain,store_domain,custom_domain,refund_policy');
    const activeCompany = resolveCompanyForBrandingHostname((companies || []) as Company[], request.headers.get('host') || request.nextUrl.hostname);

    if (!activeCompany) throw new Error('No active company');

    const { data: settingsRows } = await supabase
      .from('settings')
      .select('company_id,catalog_header_message,catalog_footer_text')
      .eq('company_id', activeCompany.id || '')
      .limit(1);
    const branding = resolveBranding(activeCompany, settingsRows?.[0] as Partial<Settings> | undefined);

    return {
      appName: branding.appName,
      shortName: branding.shortName,
      description: branding.description,
      themeColor: safeHexColor(branding.themeColor, DEFAULT_BRANDING.themeColor),
      backgroundColor: safeHexColor(branding.backgroundColor, DEFAULT_BRANDING.backgroundColor),
      slug: branding.companySlug || 'printflowpro',
      iconUrl: branding.effectiveIconUrl,
      version: branding.brandingVersion,
      usePublicBrandingIcon: true
    };
  } catch {
    return {
      appName: DEFAULT_BRANDING.appName,
      shortName: DEFAULT_BRANDING.shortName,
      description: DEFAULT_BRANDING.description,
      themeColor: DEFAULT_BRANDING.themeColor,
      backgroundColor: DEFAULT_BRANDING.backgroundColor,
      slug: 'printflowpro',
      iconUrl: DEFAULT_BRANDING.pwaIconUrl,
      version: DEFAULT_BRANDING.brandingVersion,
      usePublicBrandingIcon: true
    };
  }
}

export async function GET(request: NextRequest) {
  const branding = await resolveServerBranding(request);

  const manifest = {
    name: branding.appName,
    short_name: branding.shortName,
    description: branding.description,
    id: `/${branding.slug}`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: branding.themeColor,
    background_color: branding.backgroundColor,
    categories: ['business', 'productivity'],
    lang: 'pt-BR',
    icons: ICON_SIZES.map((size) => ({
      src: branding.usePublicBrandingIcon
        ? `/api/public/branding/icon?size=${size}&v=${encodeURIComponent(branding.version)}`
        : resolveIconSrc(request, size, branding.iconUrl),
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: size >= 192 ? 'any maskable' : 'any'
    })),
    screenshots: [
      {
        src: '/screenshots/app-home-540x720.png',
        sizes: '540x720',
        type: 'image/png',
        form_factor: 'narrow',
        label: branding.appName
      },
      {
        src: '/screenshots/app-home-1280x720.png',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: `${branding.appName} dashboard`
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/manifest+json; charset=utf-8'
    }
  });
}
