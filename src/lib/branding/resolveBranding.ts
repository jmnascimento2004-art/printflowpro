import type { Company, Settings } from '@/lib/dummy-data';

export type ActiveBranding = {
  appName: string;
  shortName: string;
  description: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  pwaIconUrl: string | null;
  effectiveIconUrl: string | null;
  themeColor: string;
  backgroundColor: string;
  companyId: string | null;
  storeId: string | null;
  companySlug: string | null;
  brandingVersion: string;
  isPlatformFallback: boolean;
};

const PLATFORM_BRANDING: ActiveBranding = {
  appName: 'PrintFlowPRO',
  shortName: 'PrintFlowPRO',
  description: 'Gestao completa para graficas rapidas e personalizados.',
  logoUrl: '/printflowpro-mark.svg',
  faviconUrl: '/printflowpro-mark.svg',
  pwaIconUrl: '/printflowpro-mark.svg',
  effectiveIconUrl: '/printflowpro-mark.svg',
  themeColor: '#1D35C9',
  backgroundColor: '#F7F9FC',
  companyId: null,
  storeId: null,
  companySlug: null,
  brandingVersion: 'printflowpro',
  isPlatformFallback: true
};

const THEME_PRESETS: Record<string, string> = {
  emerald: '#059669',
  blue: '#2563eb',
  violet: '#5b3df4',
  amber: '#d97706',
  rose: '#e11d48'
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || '';
}

function getStringField(source: unknown, keys: string[]) {
  if (!source || typeof source !== 'object') return '';
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function isUnsupportedImage(value: string) {
  return /\.(cdr|ai|eps|psd|pdf)(\?|#|$)/i.test(value);
}

function resolveAssetUrl(value?: string | null) {
  const asset = clean(value);
  if (!asset || isUnsupportedImage(asset)) return null;

  return asset;
}

function canUseManifestIconParam(value: string | null) {
  return Boolean(value && !value.startsWith('data:image/'));
}

function createBrandingVersion(parts: Array<string | null | undefined>) {
  const joined = parts.map((part) => clean(part)).filter(Boolean).join('|') || 'platform';
  let hash = 0;

  for (let index = 0; index < joined.length; index += 1) {
    hash = ((hash << 5) - hash + joined.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function normalizeThemeColor(value?: string | null) {
  const color = clean(value);
  if (!color) return PLATFORM_BRANDING.themeColor;
  return THEME_PRESETS[color] || color;
}

function createSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || null;
}

function resolveDisplayName(value: string) {
  const [brandName = ''] = value.split(/\s[-–—]\s/);
  const cleanBrandName = brandName.trim();
  return value.length > 24 && cleanBrandName.length >= 3 ? cleanBrandName : value;
}

export function normalizeBrandDomain(value?: string | null) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
}

export function resolveCompanyForBrandingHostname(companies: Partial<Company>[], hostnameValue: string) {
  const hostname = normalizeBrandDomain(hostnameValue);
  if (!hostname) return companies[0] || null;

  const exactMatch = companies.find((company) => {
    const adminDomain = normalizeBrandDomain(company.admin_domain);
    const storeDomain = normalizeBrandDomain(company.store_domain || company.custom_domain);
    return Boolean(
      (adminDomain && hostname === adminDomain) ||
      (storeDomain && hostname === storeDomain)
    );
  });

  if (exactMatch) return exactMatch;

  const hostnameSlug = hostname.replace(/[^a-z0-9]/g, '');
  return companies.find((company) => {
    const companySlug = createSlug(company.name || '')?.replace(/[^a-z0-9]/g, '') || '';
    return companySlug.length >= 4 && hostnameSlug.includes(companySlug);
  }) || companies[0] || null;
}

function stripHtml(value?: string | null) {
  return clean(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveBranding(company?: Partial<Company> | null, settings?: Partial<Settings> | null): ActiveBranding {
  const companyName = clean(company?.name);
  const companyId = clean(company?.id);

  if (!companyName || companyName === PLATFORM_BRANDING.appName) {
    return PLATFORM_BRANDING;
  }

  const displayName = resolveDisplayName(companyName);
  const logoUrl = resolveAssetUrl(company?.logo_light) || resolveAssetUrl(company?.logo_url) || resolveAssetUrl(company?.logo_dark);
  const faviconUrl = resolveAssetUrl(company?.favicon);
  const pwaIconUrl = resolveAssetUrl(getStringField(company, ['pwa_icon_url', 'pwa_icon', 'app_icon', 'icon_url']));
  const effectiveIconUrl = faviconUrl || pwaIconUrl || logoUrl;
  const description =
    stripHtml(settings?.catalog_header_message) ||
    stripHtml(settings?.catalog_footer_text) ||
    stripHtml(company?.refund_policy) ||
    `${displayName} - gestao completa para graficas, pedidos e producao.`;
  const themeColor = normalizeThemeColor(company?.theme_color);
  const brandingVersion = createBrandingVersion([
    getStringField(company, ['updated_at', 'custom_domain_verified_at']),
    getStringField(settings, ['updated_at']),
    displayName,
    faviconUrl,
    pwaIconUrl,
    logoUrl,
    themeColor,
    description
  ]);

  return {
    appName: displayName,
    shortName: displayName.length > 18 ? displayName.slice(0, 18).trim() : displayName,
    description,
    logoUrl,
    faviconUrl,
    pwaIconUrl,
    effectiveIconUrl,
    themeColor,
    backgroundColor: PLATFORM_BRANDING.backgroundColor,
    companyId: companyId || null,
    storeId: getStringField(company, ['store_id']) || null,
    companySlug: createSlug(displayName),
    brandingVersion,
    isPlatformFallback: false
  };
}

export function createBrandManifestUrl(branding: ActiveBranding) {
  const params = new URLSearchParams();
  params.set('name', branding.appName);
  params.set('short_name', branding.shortName);
  params.set('description', branding.description);
  params.set('theme_color', branding.themeColor);
  params.set('background_color', branding.backgroundColor);
  if (branding.companyId) params.set('company_id', branding.companyId);
  if (branding.companySlug) params.set('slug', branding.companySlug);
  params.set('v', branding.brandingVersion);
  if (canUseManifestIconParam(branding.effectiveIconUrl)) {
    params.set('icon', branding.effectiveIconUrl || '');
  } else {
    params.set('public_icon', '1');
  }

  return `/manifest.webmanifest?${params.toString()}`;
}

export function createStoreBrandManifestUrl(branding: ActiveBranding) {
  const params = new URLSearchParams();
  params.set('name', branding.appName);
  params.set('short_name', branding.shortName);
  params.set('description', branding.description);
  params.set('theme_color', branding.themeColor);
  params.set('background_color', branding.backgroundColor);
  if (branding.companyId) params.set('company_id', branding.companyId);
  if (branding.companySlug) params.set('slug', branding.companySlug);
  params.set('v', branding.brandingVersion);
  if (canUseManifestIconParam(branding.effectiveIconUrl)) {
    params.set('icon', branding.effectiveIconUrl || '');
  } else {
    params.set('public_icon', '1');
  }

  return `/store/manifest.webmanifest?${params.toString()}`;
}

export const DEFAULT_BRANDING = PLATFORM_BRANDING;
