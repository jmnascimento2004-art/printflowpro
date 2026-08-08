import 'server-only';

import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { normalizeWhatsAppPhone } from './template-engine';
import {
  COMPANY_TOKENS_BY_EVENT,
  LEGACY_TOKEN_ALIASES,
  isWhatsAppEventKey,
  type WhatsAppBusinessPhoneSource,
  type WhatsAppCompanyCanonicalToken,
  type WhatsAppCompanyVariableSource,
  type WhatsAppEventKey,
  type WhatsAppSettingsVariableSource,
  type WhatsAppVariableResolutionResult
} from './variable-contract';

const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const COMMON_SETTINGS_PROJECTION = 'company_id,catalog_whatsapp';
const PAYMENT_SETTINGS_PROJECTION = `${COMMON_SETTINGS_PROJECTION},pix_key,pix_key_type,pix_beneficiary_name,bank_name`;
type CompanyRow = WhatsAppCompanyVariableSource & { id: string };
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

export interface WhatsAppVariableDataSource {
  getCompany(companyId: string): Promise<CompanyRow | null>;
  getSettings(companyId: string, eventKey: WhatsAppEventKey): Promise<WhatsAppSettingsVariableSource | null>;
  getWhatsAppSettings(companyId: string): Promise<WhatsAppBusinessPhoneSource | null>;
}

export interface WhatsAppCompanyResolutionContext {
  companyId: string;
  trustedCompanyId: string;
  eventKey: WhatsAppEventKey;
  existingCompany?: CompanyRow | null;
  existingSettings?: WhatsAppSettingsVariableSource | null;
  existingWhatsAppSettings?: WhatsAppBusinessPhoneSource | null;
}

function controlledError(code: string): Error {
  return new Error(`WHATSAPP_VARIABLE_RESOLUTION_${code}`);
}

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertTenant(context: WhatsAppCompanyResolutionContext) {
  if (!context.companyId || context.companyId !== context.trustedCompanyId) {
    throw controlledError('TENANT_MISMATCH');
  }
  if (!isWhatsAppEventKey(context.eventKey)) throw controlledError('UNKNOWN_EVENT');
}

export function createSupabaseWhatsAppVariableDataSource(
  supabase: SupabaseAdminClient = getSupabaseAdminClient()
): WhatsAppVariableDataSource {
  return {
    async getCompany(companyId) {
      const result = await supabase.from('companies').select('id,name,phone,email').eq('id', companyId).maybeSingle();
      if (result.error) throw controlledError('COMPANY_QUERY_FAILED');
      return result.data as CompanyRow | null;
    },
    async getSettings(companyId, eventKey) {
      const projection = eventKey === 'order_payment_pending'
        ? PAYMENT_SETTINGS_PROJECTION
        : COMMON_SETTINGS_PROJECTION;
      const result = await supabase.from('settings')
        .select(projection)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('SETTINGS_QUERY_FAILED');
      return result.data as WhatsAppSettingsVariableSource | null;
    },
    async getWhatsAppSettings(companyId) {
      const result = await supabase.from('whatsapp_settings')
        .select('company_id,country_code,business_phone')
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error && !MISSING_SCHEMA_CODES.has(result.error.code || '')) {
        throw controlledError('WHATSAPP_SETTINGS_QUERY_FAILED');
      }
      return result.error ? null : result.data as WhatsAppBusinessPhoneSource | null;
    }
  };
}

function ensureSourceTenant(companyId: string, source?: { company_id?: string } | null) {
  if (source?.company_id && source.company_id !== companyId) throw controlledError('TENANT_MISMATCH');
}

export async function resolveWhatsAppCompanyVariables(
  context: WhatsAppCompanyResolutionContext,
  dataSource?: WhatsAppVariableDataSource
): Promise<WhatsAppVariableResolutionResult> {
  assertTenant(context);

  const queryCounts = { company: 0, settings: 0, whatsappSettings: 0 };
  const needsDataSource = context.existingCompany === undefined
    || context.existingSettings === undefined
    || context.existingWhatsAppSettings === undefined;
  const source = dataSource || (needsDataSource ? createSupabaseWhatsAppVariableDataSource() : null);
  if (needsDataSource && !source) throw controlledError('DATA_SOURCE_UNAVAILABLE');
  const companyPromise = context.existingCompany !== undefined
    ? Promise.resolve(context.existingCompany)
    : (queryCounts.company += 1, source!.getCompany(context.companyId));
  const settingsPromise = context.existingSettings !== undefined
    ? Promise.resolve(context.existingSettings)
    : (queryCounts.settings += 1, source!.getSettings(context.companyId, context.eventKey));
  const whatsappSettingsPromise = context.existingWhatsAppSettings !== undefined
    ? Promise.resolve(context.existingWhatsAppSettings)
    : (queryCounts.whatsappSettings += 1, source!.getWhatsAppSettings(context.companyId));

  const [company, settings, whatsappSettings] = await Promise.all([
    companyPromise, settingsPromise, whatsappSettingsPromise
  ]);

  if (!company) throw controlledError('COMPANY_NOT_FOUND');
  if (company.id !== context.companyId) throw controlledError('TENANT_MISMATCH');
  ensureSourceTenant(context.companyId, settings);
  ensureSourceTenant(context.companyId, whatsappSettings);

  const canonicalValues: Record<WhatsAppCompanyCanonicalToken, string> = {
    'empresa.nome': clean(company.name),
    'empresa.whatsapp': clean(settings?.catalog_whatsapp),
    'empresa.telefone': clean(company.phone),
    'empresa.email': clean(company.email),
    'empresa.pix_chave': clean(settings?.pix_key),
    'empresa.pix_tipo': clean(settings?.pix_key_type),
    'empresa.pix_titular': clean(settings?.pix_beneficiary_name),
    'empresa.banco': clean(settings?.bank_name)
  };

  const variables: Record<string, string> = {};
  const missing: WhatsAppCompanyCanonicalToken[] = [];
  for (const token of COMPANY_TOKENS_BY_EVENT[context.eventKey]) {
    const value = canonicalValues[token];
    if (value) variables[token] = value;
    else missing.push(token);
  }
  for (const [legacyToken, canonicalToken] of Object.entries(LEGACY_TOKEN_ALIASES)) {
    if (canonicalToken in variables) variables[legacyToken] = variables[canonicalToken];
  }

  const countryCode = clean(whatsappSettings?.country_code) || '55';
  const configuredBusinessPhone = normalizeWhatsAppPhone(whatsappSettings?.business_phone, countryCode);
  const catalogWhatsApp = normalizeWhatsAppPhone(settings?.catalog_whatsapp, countryCode);
  const effectiveBusinessPhone = configuredBusinessPhone || catalogWhatsApp;

  return {
    variables,
    missing,
    metadataSanitized: {
      eventKey: context.eventKey,
      effectiveBusinessPhone,
      businessPhoneSource: configuredBusinessPhone
        ? 'business_phone'
        : catalogWhatsApp
          ? 'catalog_whatsapp'
          : 'missing',
      queryCounts
    }
  };
}
