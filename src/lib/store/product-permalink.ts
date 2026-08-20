import type { Company, Product } from '@/lib/dummy-data';

export const STORE_PRODUCT_PATH_PREFIX = '/store/product/';

export function normalizePublicProductSlug(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function getPublicProductPath(slug?: string | null): string | null {
  const normalized = normalizePublicProductSlug(slug);
  return normalized ? `${STORE_PRODUCT_PATH_PREFIX}${normalized}` : null;
}

export function getProductSlugFromStorePath(pathname: string): string | null {
  if (!pathname.startsWith(STORE_PRODUCT_PATH_PREFIX)) return null;
  const segment = pathname.slice(STORE_PRODUCT_PATH_PREFIX.length).split('/')[0] || '';
  const decoded = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return '';
    }
  })();
  const normalized = normalizePublicProductSlug(decoded);
  return normalized && normalized === decoded.toLowerCase() ? normalized : null;
}

export function getStorePublicOrigin(
  company?: Pick<Company, 'store_domain' | 'custom_domain' | 'admin_domain'> | null,
  fallbackOrigin?: string | null
): string | null {
  const candidates = [company?.store_domain, company?.custom_domain, company?.admin_domain, fallbackOrigin];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname) return url.origin;
    } catch {
      // Invalid configured domains are skipped in favor of the next safe candidate.
    }
  }
  return null;
}

export function getPublicProductUrl({
  product,
  company,
  fallbackOrigin
}: {
  product?: Pick<Product, 'slug'> | null;
  company?: Pick<Company, 'store_domain' | 'custom_domain' | 'admin_domain'> | null;
  fallbackOrigin?: string | null;
}): string | null {
  const path = getPublicProductPath(product?.slug);
  const origin = getStorePublicOrigin(company, fallbackOrigin);
  return path && origin ? new URL(path, origin).toString() : null;
}
