import { supabase } from '@/lib/supabaseClient';
import { getWhatsAppTemplateDefinition, WHATSAPP_TEMPLATE_REGISTRY } from './template-registry';
import { normalizeWhatsAppPhone, renderConfiguredWhatsAppTemplate, validateWhatsAppTemplate } from './template-engine';
import { getWhatsAppSystemMessages } from './message-model';
import type { WhatsAppMessageTemplate, WhatsAppResolvedTemplate, WhatsAppSettings } from './types';
import type { WhatsAppResolvedVariables } from './variable-contract';

const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);

export interface WhatsAppPaymentSettings {
  company_id: string;
  pix_key: string;
  pix_key_type: string | null;
  pix_beneficiary_name: string | null;
  bank_name: string | null;
}

export function getDefaultWhatsAppSettings(companyId: string): WhatsAppSettings {
  return {
    company_id: companyId,
    country_code: '55',
    business_phone: null,
    signature: null,
    open_mode: 'auto',
    confirm_before_open: true,
    include_company_name: true
  };
}

function isMissingSchemaError(error: { code?: string } | null) {
  return Boolean(error?.code && MISSING_SCHEMA_CODES.has(error.code));
}

export async function loadWhatsAppCenter(companyId: string) {
  const defaults = getDefaultWhatsAppSettings(companyId);
  try {
    const [templatesResult, settingsResult] = await Promise.all([
      supabase.from('whatsapp_message_templates').select('*').eq('company_id', companyId),
      supabase.from('whatsapp_settings').select('*').eq('company_id', companyId).maybeSingle()
    ]);
    if (templatesResult.error && !isMissingSchemaError(templatesResult.error)) throw templatesResult.error;
    if (settingsResult.error && !isMissingSchemaError(settingsResult.error)) throw settingsResult.error;
    return {
      templates: (templatesResult.data || []) as WhatsAppMessageTemplate[],
      settings: (settingsResult.data as WhatsAppSettings | null) || defaults,
      usedFallback: Boolean(templatesResult.error || settingsResult.error)
    };
  } catch {
    return { templates: [] as WhatsAppMessageTemplate[], settings: defaults, usedFallback: true };
  }
}

export async function loadWhatsAppPaymentSettings(companyId: string): Promise<WhatsAppPaymentSettings | null> {
  if (!companyId) return null;
  const { data, error } = await supabase
    .from('settings')
    .select('company_id,pix_key,pix_key_type,pix_beneficiary_name,bank_name')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.company_id !== companyId) return null;
  return {
    company_id: data.company_id,
    pix_key: typeof data.pix_key === 'string' ? data.pix_key.trim() : '',
    pix_key_type: typeof data.pix_key_type === 'string' ? data.pix_key_type.trim() : null,
    pix_beneficiary_name: typeof data.pix_beneficiary_name === 'string' ? data.pix_beneficiary_name.trim() : null,
    bank_name: typeof data.bank_name === 'string' ? data.bank_name.trim() : null
  };
}

export async function saveWhatsAppTemplate(input: {
  companyId: string;
  eventKey: string;
  content: string;
  active: boolean;
  userId?: string | null;
}) {
  const definition = getWhatsAppTemplateDefinition(input.eventKey);
  if (!definition) throw new Error('Modelo de WhatsApp desconhecido.');
  const validation = validateWhatsAppTemplate(input.content, definition);
  if (!validation.valid) throw new Error(validation.errors[0]);
  const { data, error } = await supabase.from('whatsapp_message_templates').upsert({
    company_id: input.companyId,
    event_key: definition.eventKey,
    name: definition.name,
    content: validation.normalized,
    active: input.active,
    updated_by: input.userId || null,
    created_by: input.userId || null
  }, { onConflict: 'company_id,event_key' }).select('*').single();
  if (error) throw error;
  return data as WhatsAppMessageTemplate;
}

export async function restoreWhatsAppTemplate(companyId: string, eventKey: string) {
  const { error } = await supabase.from('whatsapp_message_templates').delete().eq('company_id', companyId).eq('event_key', eventKey);
  if (error) throw error;
}

export async function saveWhatsAppSettings(settings: WhatsAppSettings, userId?: string | null) {
  const countryCode = settings.country_code.replace(/\D/g, '');
  if (!/^\d{1,3}$/.test(countryCode)) throw new Error('Informe um código de país válido com até 3 dígitos.');
  const businessPhone = settings.business_phone
    ? normalizeWhatsAppPhone(settings.business_phone, countryCode)
    : '';
  if (settings.business_phone && !businessPhone) throw new Error('Informe um telefone comercial válido com DDD.');
  const payload = {
    company_id: settings.company_id,
    country_code: countryCode,
    business_phone: businessPhone || null,
    signature: settings.signature?.trim() || null,
    open_mode: settings.open_mode,
    confirm_before_open: settings.confirm_before_open,
    include_company_name: settings.include_company_name,
    updated_by: userId || null,
    created_by: userId || null
  };
  const { data, error } = await supabase.from('whatsapp_settings').upsert(payload, { onConflict: 'company_id' }).select('*').single();
  if (error) throw error;
  return data as WhatsAppSettings;
}

export async function resolveWhatsAppTemplate(
  companyId: string,
  eventKey: string,
  values: WhatsAppResolvedVariables
): Promise<WhatsAppResolvedTemplate> {
  const definition = getWhatsAppTemplateDefinition(eventKey);
  if (!definition) throw new Error('Evento de WhatsApp desconhecido.');
  const fallbackSettings = getDefaultWhatsAppSettings(companyId);
  let custom: WhatsAppMessageTemplate | null = null;
  let settings = fallbackSettings;
  let usedFallback = false;
  try {
    const [templateResult, settingsResult] = await Promise.all([
      supabase.from('whatsapp_message_templates').select('*').eq('company_id', companyId).eq('event_key', eventKey).maybeSingle(),
      supabase.from('whatsapp_settings').select('*').eq('company_id', companyId).maybeSingle()
    ]);
    if (templateResult.error) throw templateResult.error;
    if (settingsResult.error) throw settingsResult.error;
    custom = templateResult.data as WhatsAppMessageTemplate | null;
    settings = (settingsResult.data as WhatsAppSettings | null) || fallbackSettings;
  } catch {
    usedFallback = true;
  }
  const content = custom?.content || definition.defaultContent;
  const renderedContent = renderConfiguredWhatsAppTemplate(content, definition, values, settings);
  return {
    definition,
    content,
    renderedContent,
    active: custom ? custom.active : definition.enabledByDefault,
    customized: Boolean(custom),
    settings,
    usedFallback
  };
}

export function getResolvedWhatsAppTemplates(systemOverrides: WhatsAppMessageTemplate[]) {
  return getWhatsAppSystemMessages(WHATSAPP_TEMPLATE_REGISTRY, systemOverrides);
}
