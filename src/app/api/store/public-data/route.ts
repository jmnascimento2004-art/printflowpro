import { NextRequest, NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/publicSupabaseClient';
import type { Category, Company, PickupPoint, Product } from '@/lib/dummy-data';

interface PublicStoreBanner {
  id: string;
  image_url: string;
  title?: string;
  subtitle?: string;
  link?: string;
  company_id?: string;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const normalizeDomain = (value?: string | null) => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  return withoutProtocol.split('/')[0].split(':')[0].replace(/^www\./, '');
};

const normalizeDomainSlug = (value: string = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const resolveStoreCompanyForHost = (companies: Company[], host: string) => {
  const hostname = normalizeDomain(host);
  if (!hostname || LOCAL_HOSTNAMES.has(hostname)) return companies[0] || null;

  const exactDomainMatch = companies.find((company) => {
    const adminDomain = normalizeDomain(company.admin_domain);
    const storeDomain = normalizeDomain(company.store_domain);
    const customDomain = normalizeDomain(company.custom_domain);

    return adminDomain === hostname || storeDomain === hostname || customDomain === hostname;
  });
  if (exactDomainMatch) return exactDomainMatch;

  const hostnameWithoutKnownPrefix = hostname.replace(/^(admin|store)\./, '');
  const hostnameSlug = normalizeDomainSlug(hostnameWithoutKnownPrefix.split('.')[0] || hostnameWithoutKnownPrefix);
  return companies.find((company) => {
    const companySlug = normalizeDomainSlug(company.name);
    return companySlug.length >= 4 && hostnameSlug.includes(companySlug);
  }) || null;
};

export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.hostname;

  const { data: companies, error: companiesError } = await publicSupabase
    .from('companies')
    .select('*');

  if (companiesError) {
    return NextResponse.json(
      { error: 'Nao foi possivel carregar as empresas publicas.', details: companiesError.message },
      { status: 500 }
    );
  }

  const companyRows = (companies || []) as Company[];
  const company = resolveStoreCompanyForHost(companyRows, host);

  if (!company?.id) {
    return NextResponse.json(
      {
        error: 'Empresa da loja nao encontrada para o dominio.',
        host: normalizeDomain(host),
        companiesCount: companyRows.length
      },
      { status: 404 }
    );
  }

  const [
    settingsResult,
    categoriesResult,
    productsResult,
    pickupPointsResult,
    bannersResult
  ] = await Promise.all([
    publicSupabase.from('settings').select('*').eq('company_id', company.id),
    publicSupabase.from('categories').select('*').eq('company_id', company.id),
    publicSupabase
      .from('products')
      .select('*')
      .eq('company_id', company.id)
      .eq('active', true)
      .eq('catalog_active', true),
    publicSupabase.from('pickup_points').select('*').eq('company_id', company.id),
    publicSupabase.from('store_banners').select('*').eq('company_id', company.id)
  ]);

  const errors = [
    settingsResult.error,
    categoriesResult.error,
    productsResult.error,
    pickupPointsResult.error,
    bannersResult.error
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Nao foi possivel carregar dados publicos da loja.', details: errors.map((item) => item?.message) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    debug: {
      host: normalizeDomain(host),
      company_id: company.id,
      company_name: company.name,
      companies_count: companyRows.length,
      products_count: (productsResult.data || []).length,
      categories_count: (categoriesResult.data || []).length
    },
    company,
    settings: settingsResult.data?.[0] || null,
    categories: ((categoriesResult.data || []) as Category[]).map((category) => ({
      ...category,
      show_in_catalog: category.show_in_catalog ?? true
    })),
    products: (productsResult.data || []) as Product[],
    pickupPoints: (pickupPointsResult.data || []) as PickupPoint[],
    banners: (bannersResult.data || []) as PublicStoreBanner[]
  });
}
