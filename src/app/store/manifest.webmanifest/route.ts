import { NextRequest, NextResponse } from 'next/server';
import type { Company, Settings } from '@/lib/dummy-data';
import {
  DEFAULT_BRANDING,
  resolveBranding,
  resolveCompanyForBrandingHostname
} from '@/lib/branding/resolveBranding';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';

const ICON_SIZES = [192, 512];

function getParam(request: NextRequest, key: string, fallback: string) {
  return request.nextUrl.searchParams.get(key)?.trim() || fallback;
}

function safeHexColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function withoutInstallPrefix(value: string) {
  return value.replace(/^(Dashboard|Catálogo|Catalogo)\s+-\s+/i, '').trim() || value;
}

function storeAppName(value: string) {
  return /^(Catálogo|Catalogo)\s+-\s+/i.test(value) ? value : `Catálogo - ${withoutInstallPrefix(value)}`;
}

function resolveIconSrc(request: NextRequest, size: number, resolvedIcon?: string | null) {
  const icon = resolvedIcon || request.nextUrl.searchParams.get('icon')?.trim();
  const usePublicBrandingIcon = request.nextUrl.searchParams.get('public_icon') === '1';
  if (usePublicBrandingIcon) {
    const version = request.nextUrl.searchParams.get('v')?.trim() || request.nextUrl.searchParams.get('slug')?.trim() || 'store-branding';
    return `/api/public/branding/icon?size=${size}&v=${encodeURIComponent(version)}`;
  }

  if (!icon) return `/icons/icon-${size}x${size}.png`;

  try {
    const absoluteIcon = new URL(icon, request.nextUrl.origin).href;
    return `/api/pwa/icon?src=${encodeURIComponent(absoluteIcon)}&size=${size}`;
  } catch {
    return `/icons/icon-${size}x${size}.png`;
  }
}

function fallbackStoreManifest() {
  return {
    name: `Catálogo - ${DEFAULT_BRANDING.appName || 'PrintFlowPRO'}`,
    short_name: 'Catálogo',
    description: `Catálogo online da ${DEFAULT_BRANDING.appName || 'PrintFlowPRO'}`,
    id: '/store/catalogo',
    start_url: '/store/',
    scope: '/store/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: DEFAULT_BRANDING.themeColor || '#2533C5',
    background_color: DEFAULT_BRANDING.backgroundColor || '#ffffff',
    categories: ['shopping', 'business'],
    lang: 'pt-BR',
    icons: ICON_SIZES.map((size) => ({
      src: `/icons/icon-${size}x${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable'
    }))
  };
}

function manifestResponse(manifest: Record<string, unknown>) {
  return NextResponse.json(manifest, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/manifest+json; charset=utf-8'
    }
  });
}

async function resolveStoreBranding(request: NextRequest) {
  if (request.nextUrl.searchParams.has('name')) {
    const appName = getParam(request, 'name', DEFAULT_BRANDING.appName);
    const iconUrl = request.nextUrl.searchParams.get('icon')?.trim() || null;
    return {
      appName,
      shortName: getParam(request, 'short_name', appName || DEFAULT_BRANDING.shortName),
      description: getParam(request, 'description', DEFAULT_BRANDING.description),
      themeColor: safeHexColor(getParam(request, 'theme_color', DEFAULT_BRANDING.themeColor), DEFAULT_BRANDING.themeColor),
      backgroundColor: safeHexColor(getParam(request, 'background_color', DEFAULT_BRANDING.backgroundColor), DEFAULT_BRANDING.backgroundColor),
      slug: request.nextUrl.searchParams.get('slug')?.trim() || 'catalogo',
      iconUrl,
      version: request.nextUrl.searchParams.get('v')?.trim() || request.nextUrl.searchParams.get('slug')?.trim() || 'store-branding',
      usePublicBrandingIcon: request.nextUrl.searchParams.get('public_icon') === '1' || (!iconUrl && appName !== DEFAULT_BRANDING.appName)
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: companies } = await supabase
      .from('companies')
      .select('id,name,logo_url,logo_light,logo_dark,favicon,theme_color,admin_domain,store_domain,custom_domain,refund_policy');
    const activeCompany = resolveCompanyForBrandingHostname((companies || []) as Company[], request.headers.get('host') || request.nextUrl.hostname);
    if (!activeCompany) throw new Error('No active store company');

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
      slug: `${branding.companySlug || 'loja'}-catalogo`,
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
      slug: 'catalogo',
      iconUrl: DEFAULT_BRANDING.pwaIconUrl,
      version: DEFAULT_BRANDING.brandingVersion,
      usePublicBrandingIcon: true
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const branding = await resolveStoreBranding(request);
    const companyName = withoutInstallPrefix(branding.appName || DEFAULT_BRANDING.appName);
    const appName = storeAppName(branding.appName || DEFAULT_BRANDING.appName);

    return manifestResponse({
      ...fallbackStoreManifest(),
      name: appName,
      short_name: 'Catálogo',
      description: `Catálogo online da ${companyName}`,
      id: `/store/${branding.slug}`,
      theme_color: branding.themeColor,
      background_color: branding.backgroundColor,
      icons: ICON_SIZES.map((size) => ({
        src: branding.usePublicBrandingIcon
          ? `/api/public/branding/icon?size=${size}&v=${encodeURIComponent(branding.version)}`
          : resolveIconSrc(request, size, branding.iconUrl),
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose: 'any maskable'
      })),
      screenshots: [
        {
          src: '/screenshots/app-home-540x720.png',
          sizes: '540x720',
          type: 'image/png',
          form_factor: 'narrow',
          label: appName
        }
      ]
    });
  } catch {
    return manifestResponse(fallbackStoreManifest());
  }
}
