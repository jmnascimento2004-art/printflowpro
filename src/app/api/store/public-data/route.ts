import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from '@/lib/store/normalize-store-host';
import { resolveStoreLookupHostname } from '@/lib/store/resolve-store-lookup-hostname.mjs';

export const dynamic = 'force-dynamic';

const COMPANY_FIELDS = [
  'id', 'name', 'document', 'logo_url', 'logo_light', 'logo_dark', 'favicon', 'phone', 'email',
  'cep', 'street', 'number', 'neighborhood', 'city', 'state', 'theme_color', 'admin_domain',
  'store_domain', 'custom_domain', 'instagram_url', 'facebook_url', 'youtube_url', 'refund_policy',
  'show_payments_visa', 'show_payments_mastercard', 'show_payments_elo', 'show_payments_hipercard',
  'show_payments_diners', 'show_payments_amex', 'show_payments_boleto', 'show_payments_deposito',
  'show_payments_transferencia', 'show_payments_pix', 'show_delivery_sedex', 'show_delivery_pac',
  'show_delivery_correios', 'show_delivery_jadlog', 'show_delivery_motoboy',
  'show_security_letsencrypt', 'show_security_google', 'card_benefits_1_title',
  'card_benefits_1_subtitle', 'card_benefits_1_active', 'card_benefits_2_title',
  'card_benefits_2_subtitle', 'card_benefits_2_active', 'card_benefits_3_title',
  'card_benefits_3_subtitle', 'card_benefits_3_active', 'card_benefits_4_title',
  'card_benefits_4_subtitle', 'card_benefits_4_active',
  'card_benefits_1_icon', 'card_benefits_1_sort_order', 'card_benefits_2_icon',
  'card_benefits_2_sort_order', 'card_benefits_3_icon', 'card_benefits_3_sort_order',
  'card_benefits_4_icon', 'card_benefits_4_sort_order', 'card_benefits_5_title',
  'card_benefits_5_subtitle', 'card_benefits_5_active', 'card_benefits_5_icon',
  'card_benefits_5_sort_order', 'card_benefits_6_title', 'card_benefits_6_subtitle',
  'card_benefits_6_active', 'card_benefits_6_icon', 'card_benefits_6_sort_order',
  'card_benefits_7_title', 'card_benefits_7_subtitle', 'card_benefits_7_active',
  'card_benefits_7_icon', 'card_benefits_7_sort_order', 'img_payments_visa',
  'img_payments_mastercard', 'img_payments_elo', 'img_payments_hipercard', 'img_payments_diners',
  'img_payments_amex', 'img_payments_boleto', 'img_payments_transferencia', 'img_payments_pix',
  'img_delivery_sedex', 'img_delivery_pac', 'img_delivery_correios', 'img_delivery_jadlog',
  'img_delivery_motoboy', 'img_security_letsencrypt', 'img_security_google'
].join(',');

const SETTINGS_FIELDS = [
  'top_bar_hours', 'top_bar_show_pickup', 'top_bar_phone', 'footer_show_address',
  'footer_hours_message', 'footer_hours_week', 'footer_hours_sat', 'footer_hours_sat_time',
  'footer_hours_sat_desc', 'company_address', 'delivery_motoboy_price_km',
  'delivery_car_price_km', 'delivery_min_fee', 'catalog_header_message', 'catalog_whatsapp',
  'free_pickup_alert', 'catalog_bestsellers_section_enabled',
  'catalog_promotions_section_enabled', 'catalog_highlights_section_enabled', 'catalog_footer_text'
].join(',');

const CATEGORY_FIELDS = 'id,parent_id,name,description,show_in_catalog';
const PRODUCT_FIELDS = [
  'id', 'category_id', 'name', 'description', 'sku', 'pricing_type', 'sales_price', 'active',
  'catalog_active', 'pricing_details', 'image_url', 'volume_pricing',
  'variant_options', 'color_options', 'is_promo', 'is_highlight'
].join(',');
const PICKUP_POINT_FIELDS = [
  'id', 'name', 'street', 'number', 'neighborhood', 'city', 'state', 'hours_week', 'hours_sat',
  'active', 'address', 'hours'
].join(',');
const BANNER_FIELDS = 'id,image_url,title,subtitle,link';

type PublicProductRow = Record<string, unknown> & {
  pricing_details?: Record<string, unknown> | null;
};

function sanitizeProduct(row: PublicProductRow) {
  const pricingDetails = row.pricing_details;
  const publicPricingDetails = pricingDetails
    ? {
        configurator_options: pricingDetails.configurator_options,
        gallery_images: pricingDetails.gallery_images,
        delivery_time: pricingDetails.delivery_time
      }
    : undefined;

  return {
    ...row,
    pricing_details: publicPricingDetails
  };
}

function publicError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function isServiceUnavailable(error: unknown) {
  if (error instanceof TypeError) return true;
  const candidate = error as { message?: unknown } | null;
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('fetch failed') || message.includes('network error');
}

function logStoreError(stage: string, host: string | null, error: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  console.error('[Store public-data]', {
    route: '/api/store/public-data',
    stage,
    host,
    code: typeof candidate?.code === 'string' ? candidate.code : undefined,
    message: typeof candidate?.message === 'string' ? candidate.message : 'Unexpected error'
  });
}

export async function GET(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const rawHost = forwardedHost || request.headers.get('host') || request.nextUrl.hostname;
  const requestHost = normalizeStoreHost(rawHost);
  const developmentHost = process.env.NODE_ENV !== 'production'
    ? normalizeStoreHost(process.env.STORE_PUBLIC_DEV_HOST)
    : null;
  const localAwareHost = requestHost && isLocalStoreHost(requestHost) ? developmentHost : requestHost;
  const host = resolveStoreLookupHostname(localAwareHost);

  if (!host || isLocalStoreHost(host)) {
    return publicError('Dominio da loja ausente ou invalido.', 'INVALID_STORE_HOST', 400);
  }

  try {
    const publicSupabase = getSupabaseAdminClient();
    const companyResult = await publicSupabase
      .from('companies')
      .select(COMPANY_FIELDS)
      .or(`store_domain.eq.${host},custom_domain.eq.${host},admin_domain.eq.${host}`)
      .limit(2);

    if (companyResult.error) {
      logStoreError('resolve-company', host, companyResult.error);
      return publicError(
        'Nao foi possivel carregar a loja no momento.',
        'STORE_DATA_UNAVAILABLE',
        isServiceUnavailable(companyResult.error) ? 503 : 500
      );
    }

    const companyRows = companyResult.data as unknown as Array<Record<string, unknown>> | null;

    if (!companyRows?.length) {
      return publicError('Loja nao encontrada.', 'STORE_NOT_FOUND', 404);
    }

    if (companyRows.length !== 1) {
      logStoreError('resolve-company-ambiguous', host, { code: 'AMBIGUOUS_STORE_DOMAIN' });
      return publicError('Nao foi possivel carregar a loja no momento.', 'STORE_DATA_UNAVAILABLE', 500);
    }

    const company = companyRows[0];
    const companyId = String(company.id || '');
    if (!companyId) {
      logStoreError('resolve-company-id', host, { code: 'MISSING_COMPANY_ID' });
      return publicError('Nao foi possivel carregar a loja no momento.', 'STORE_DATA_UNAVAILABLE', 500);
    }

    const [settingsResult, categoriesResult, productsResult, pickupPointsResult, bannersResult] =
      await Promise.all([
        publicSupabase.from('settings').select(SETTINGS_FIELDS).eq('company_id', companyId).maybeSingle(),
        publicSupabase.from('categories').select(CATEGORY_FIELDS).eq('company_id', companyId),
        publicSupabase
          .from('products')
          .select(PRODUCT_FIELDS)
          .eq('company_id', companyId)
          .eq('active', true)
          .eq('catalog_active', true),
        publicSupabase
          .from('pickup_points')
          .select(PICKUP_POINT_FIELDS)
          .eq('company_id', companyId)
          .eq('active', true),
        publicSupabase.from('store_banners').select(BANNER_FIELDS).eq('company_id', companyId)
      ]);

    const failedResult = [
      ['settings', settingsResult.error],
      ['categories', categoriesResult.error],
      ['products', productsResult.error],
      ['pickup-points', pickupPointsResult.error],
      ['banners', bannersResult.error]
    ].find(([, error]) => Boolean(error));

    if (failedResult) {
      logStoreError(String(failedResult[0]), host, failedResult[1]);
      return publicError('Nao foi possivel carregar a loja no momento.', 'STORE_DATA_UNAVAILABLE', 500);
    }

    return NextResponse.json(
      {
        company,
        settings: settingsResult.data || null,
        categories: (categoriesResult.data || []).map((category) => ({
          ...category,
          show_in_catalog: category.show_in_catalog ?? true
        })),
        products: ((productsResult.data || []) as unknown as PublicProductRow[]).map(sanitizeProduct),
        pickupPoints: pickupPointsResult.data || [],
        banners: bannersResult.data || []
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0'
        }
      }
    );
  } catch (error) {
    logStoreError('request', host, error);
    return publicError(
      'Nao foi possivel carregar a loja no momento.',
      'STORE_DATA_UNAVAILABLE',
      isServiceUnavailable(error) ? 503 : 500
    );
  }
}
