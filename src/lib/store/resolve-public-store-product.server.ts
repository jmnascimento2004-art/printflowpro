import 'server-only';

import { cache } from 'react';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from '@/lib/store/normalize-store-host';
import { normalizePublicProductSlug } from '@/lib/store/product-permalink';
import { resolveStoreLookupHostname } from '@/lib/store/resolve-store-lookup-hostname.mjs';

export interface PublicStoreProductMetadata {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  storeOrigin: string;
}

function resolveLookupHost(rawHost: string | null): string | null {
  const incoming = normalizeStoreHost(rawHost);
  const development = process.env.NODE_ENV !== 'production'
    ? normalizeStoreHost(process.env.STORE_PUBLIC_DEV_HOST)
    : null;
  return resolveStoreLookupHostname(incoming && isLocalStoreHost(incoming) ? development : incoming);
}

export const resolvePublicStoreProduct = cache(async (
  rawHost: string | null,
  rawSlug: string
): Promise<PublicStoreProductMetadata | null> => {
  const host = resolveLookupHost(rawHost);
  const slug = normalizePublicProductSlug(rawSlug);
  if (!host || isLocalStoreHost(host) || !slug || slug !== rawSlug.toLowerCase()) return null;

  const supabase = getSupabaseAdminClient();
  const companyResult = await supabase
    .from('companies')
    .select('id,name,store_domain,custom_domain,admin_domain')
    .or(`store_domain.eq.${host},custom_domain.eq.${host},admin_domain.eq.${host}`)
    .limit(2);

  const companies = companyResult.data as Array<Record<string, unknown>> | null;
  if (companyResult.error || companies?.length !== 1) return null;

  const company = companies[0];
  const companyId = String(company.id || '');
  if (!companyId) return null;

  const productResult = await supabase
    .from('products')
    .select('slug,name,description,image_url,pricing_details')
    .eq('company_id', companyId)
    .eq('slug', slug)
    .eq('active', true)
    .eq('catalog_active', true)
    .maybeSingle();

  if (productResult.error || !productResult.data) return null;
  const product = productResult.data as Record<string, unknown>;
  const pricingDetails = product.pricing_details as Record<string, unknown> | null;
  const gallery = Array.isArray(pricingDetails?.gallery_images)
    ? pricingDetails.gallery_images as Array<Record<string, unknown>>
    : [];
  const galleryImage = gallery.find((image) => image.is_primary === true)?.url || gallery[0]?.url;
  const canonicalDomain = [company.store_domain, company.custom_domain, company.admin_domain]
    .map((candidate) => normalizeStoreHost(String(candidate || '')))
    .find(Boolean) || host;
  const storeOrigin = new URL(`https://${canonicalDomain}`).origin;

  return {
    slug,
    name: String(product.name || ''),
    description: String(product.description || ''),
    imageUrl: String(product.image_url || galleryImage || '') || null,
    storeOrigin
  };
});
