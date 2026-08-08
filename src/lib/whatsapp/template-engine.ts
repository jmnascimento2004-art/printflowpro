import type { WhatsAppSettings, WhatsAppTemplateDefinition } from './types';
import type { WhatsAppVariableValue } from './variable-contract';

export const WHATSAPP_TEMPLATE_MAX_LENGTH = 4000;
const VARIABLE_PATTERN = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)\s*\}\}/g;
const PROTOCOL_PATTERN = /(?:https?:|javascript:|data:|\/\/)/i;

export function normalizeWhatsAppTemplateContent(content: string) {
  return String(content || '').replace(/\r\n?/g, '\n').trim();
}

export function extractWhatsAppTemplateVariables(content: string) {
  const variables = new Set<string>();
  for (const match of normalizeWhatsAppTemplateContent(content).matchAll(VARIABLE_PATTERN)) {
    variables.add(match[1]);
  }
  return [...variables];
}

export function validateWhatsAppTemplate(content: string, definition: WhatsAppTemplateDefinition) {
  const normalized = normalizeWhatsAppTemplateContent(content);
  const variables = extractWhatsAppTemplateVariables(normalized);
  const allowed = new Set(definition.allowedVariables);
  const unknownVariables = variables.filter((variable) => !allowed.has(variable));
  const malformedVariables = [...normalized.matchAll(/\{\{([^}]*)\}\}/g)]
    .map((match) => match[1].trim())
    .filter((variable) => !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/.test(variable));

  const errors: string[] = [];
  if (!normalized) errors.push('A mensagem não pode ficar vazia.');
  if (normalized.length > WHATSAPP_TEMPLATE_MAX_LENGTH) errors.push(`A mensagem deve ter no máximo ${WHATSAPP_TEMPLATE_MAX_LENGTH} caracteres.`);
  if (unknownVariables.length > 0) errors.push(`Variáveis não permitidas: ${unknownVariables.map((item) => `{{${item}}}`).join(', ')}.`);
  if (malformedVariables.length > 0) errors.push('Existe uma variável com formato inválido.');

  return { valid: errors.length === 0, errors, unknownVariables, variables, normalized };
}

export function renderWhatsAppTemplate(
  content: string,
  definition: WhatsAppTemplateDefinition,
  values: Readonly<Record<string, WhatsAppVariableValue | undefined>>
) {
  const allowed = new Set(definition.allowedVariables);
  return normalizeWhatsAppTemplateContent(content).replace(VARIABLE_PATTERN, (fullMatch, variable: string) => {
    if (!allowed.has(variable)) return fullMatch;
    const value = values[variable];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function resolveWhatsAppPreviewVariables(
  definition: WhatsAppTemplateDefinition,
  currentCompanyName?: string | null
) {
  const companyName = currentCompanyName?.trim();
  return {
    ...definition.sampleVariables,
    empresa_nome: companyName || definition.sampleVariables.empresa_nome || 'Sua Empresa',
    'empresa.nome': companyName || definition.sampleVariables['empresa.nome'] || 'Sua Empresa'
  };
}

export function renderConfiguredWhatsAppTemplate(
  content: string,
  definition: WhatsAppTemplateDefinition,
  values: Readonly<Record<string, WhatsAppVariableValue | undefined>>,
  settings?: Pick<WhatsAppSettings, 'include_company_name' | 'signature'>
) {
  const effectiveValues = settings?.include_company_name === false
    ? { ...values, empresa_nome: '', 'empresa.nome': '' }
    : values;
  let rendered = renderWhatsAppTemplate(content, definition, effectiveValues)
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (settings?.signature?.trim()) rendered = `${rendered}\n\n${settings.signature.trim()}`;
  return rendered;
}

export function normalizeWhatsAppPhone(phone?: string | null, countryCode = '55') {
  const raw = String(phone || '').trim();
  if (!raw || PROTOCOL_PATTERN.test(raw)) return '';
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  const normalizedCountryCode = String(countryCode || '55').replace(/\D/g, '');
  if (!digits || !normalizedCountryCode) return '';

  if (digits.startsWith(normalizedCountryCode)) {
    const nationalDigits = digits.slice(normalizedCountryCode.length);
    return nationalDigits.length === 10 || nationalDigits.length === 11 ? digits : '';
  }
  if (digits.length === 10 || digits.length === 11) digits = `${normalizedCountryCode}${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : '';
}

export function buildWhatsAppUrl(
  phone: string,
  message = '',
  options?: Pick<WhatsAppSettings, 'country_code' | 'open_mode'>
) {
  const normalizedPhone = normalizeWhatsAppPhone(phone, options?.country_code || '55');
  if (!normalizedPhone) return '';
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  if (options?.open_mode === 'web') {
    const separator = message ? '&' : '';
    return `https://web.whatsapp.com/send?phone=${normalizedPhone}${separator}${message ? `text=${encodeURIComponent(message)}` : ''}`;
  }
  return `https://wa.me/${normalizedPhone}${text}`;
}

export function openWhatsAppUrl(
  phone: string,
  message = '',
  options?: Pick<WhatsAppSettings, 'country_code' | 'open_mode'>
) {
  if (typeof window === 'undefined') return false;
  const url = buildWhatsAppUrl(phone, message, options);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
