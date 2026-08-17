import { supabase } from '@/lib/supabaseClient';
import { getWhatsAppTemplateDefinition, WHATSAPP_TEMPLATE_REGISTRY } from './template-registry';
import { normalizeWhatsAppPhone, validateWhatsAppTemplate } from './template-engine';
import { getWhatsAppSystemMessages } from './message-model';
import type { WhatsAppMessageTemplate, WhatsAppSettings } from './types';
import type { WhatsAppEventKey } from './variable-contract';

const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);

type OperationalWhatsAppEventKey = Exclude<WhatsAppEventKey, 'store_product_request'>;

export interface ResolvedOperationalWhatsAppMessage {
  eventKey: OperationalWhatsAppEventKey;
  active: boolean;
  confirmBeforeOpen: boolean;
  href: string;
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

export async function resolveOperationalWhatsAppMessage(
  accessToken: string | undefined,
  eventKey: OperationalWhatsAppEventKey,
  contextId: string
): Promise<ResolvedOperationalWhatsAppMessage> {
  if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  const response = await fetch('/api/whatsapp/system-message/runtime', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ eventKey, contextId })
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Não foi possível preparar a mensagem agora.');
  }
  if (
    !payload ||
    payload.eventKey !== eventKey ||
    typeof payload.active !== 'boolean' ||
    typeof payload.confirmBeforeOpen !== 'boolean' ||
    typeof payload.href !== 'string' ||
    (payload.active && !payload.href)
  ) {
    throw new Error('A resposta do WhatsApp foi inválida. Tente novamente.');
  }
  return {
    eventKey,
    active: payload.active,
    confirmBeforeOpen: payload.confirmBeforeOpen,
    href: payload.href
  };
}

export function getResolvedWhatsAppTemplates(systemOverrides: WhatsAppMessageTemplate[]) {
  return getWhatsAppSystemMessages(WHATSAPP_TEMPLATE_REGISTRY, systemOverrides);
}
