import {
  extractWhatsAppTemplateVariables,
  normalizeWhatsAppTemplateContent,
  WHATSAPP_TEMPLATE_MAX_LENGTH
} from './template-engine';
import type { WhatsAppCustomMessageContext, WhatsAppTemplateVariable } from './types';

export const WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH = 120;

export const WHATSAPP_CUSTOM_MESSAGE_CONTEXTS = ['generic', 'customer'] as const satisfies readonly WhatsAppCustomMessageContext[];

const GENERIC_VARIABLES = [
  'empresa.nome',
  'empresa.whatsapp',
  'empresa.telefone',
  'empresa.email'
] as const;

export const WHATSAPP_CUSTOM_VARIABLES_BY_CONTEXT = {
  generic: GENERIC_VARIABLES,
  customer: [
    ...GENERIC_VARIABLES,
    'cliente.nome',
    'cliente.nome_fantasia',
    'cliente.whatsapp',
    'cliente.email'
  ]
} as const satisfies Record<WhatsAppCustomMessageContext, readonly WhatsAppTemplateVariable[]>;

export type WhatsAppCustomMessageInput = {
  name: string;
  content: string;
  contextType: string;
  eventKey?: never;
  event_key?: never;
};

export type WhatsAppCustomMessageValidation = {
  valid: boolean;
  errors: string[];
  normalizedName: string;
  normalizedContent: string;
  contextType: WhatsAppCustomMessageContext | null;
  variables: string[];
  unknownVariables: string[];
};

const COMPLETE_PLACEHOLDER_PATTERN = /\{\{[^{}]*\}\}/g;
const VALID_PLACEHOLDER_BODY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;

export function isWhatsAppCustomMessageContext(value: string): value is WhatsAppCustomMessageContext {
  return (WHATSAPP_CUSTOM_MESSAGE_CONTEXTS as readonly string[]).includes(value);
}

export function getWhatsAppCustomVariables(contextType: WhatsAppCustomMessageContext) {
  return WHATSAPP_CUSTOM_VARIABLES_BY_CONTEXT[contextType];
}

export function validateWhatsAppCustomMessage(input: WhatsAppCustomMessageInput): WhatsAppCustomMessageValidation {
  const normalizedName = String(input.name || '').trim();
  const normalizedContent = normalizeWhatsAppTemplateContent(input.content);
  const contextType = isWhatsAppCustomMessageContext(input.contextType) ? input.contextType : null;
  const variables = extractWhatsAppTemplateVariables(normalizedContent);
  const allowed = new Set<string>(contextType ? getWhatsAppCustomVariables(contextType) : []);
  const unknownVariables = variables.filter((variable) => !allowed.has(variable));
  const completePlaceholders = [...normalizedContent.matchAll(COMPLETE_PLACEHOLDER_PATTERN)];
  const malformedCompletePlaceholder = completePlaceholders.some((match) => {
    const body = match[0].slice(2, -2).trim();
    return !VALID_PLACEHOLDER_BODY_PATTERN.test(body);
  });
  const contentWithoutCompletePlaceholders = normalizedContent.replace(COMPLETE_PLACEHOLDER_PATTERN, '');
  const hasUnbalancedPlaceholder = contentWithoutCompletePlaceholders.includes('{{') || contentWithoutCompletePlaceholders.includes('}}');

  const errors: string[] = [];
  if (Object.prototype.hasOwnProperty.call(input, 'eventKey') || Object.prototype.hasOwnProperty.call(input, 'event_key')) {
    errors.push('Mensagens personalizadas não podem usar eventos do sistema.');
  }
  if (!normalizedName) errors.push('O nome da mensagem não pode ficar vazio.');
  if (normalizedName.length > WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH) {
    errors.push(`O nome deve ter no máximo ${WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH} caracteres.`);
  }
  if (!normalizedContent) errors.push('A mensagem não pode ficar vazia.');
  if (normalizedContent.length > WHATSAPP_TEMPLATE_MAX_LENGTH) {
    errors.push(`A mensagem deve ter no máximo ${WHATSAPP_TEMPLATE_MAX_LENGTH} caracteres.`);
  }
  if (!contextType) errors.push('O contexto da mensagem é inválido.');
  if (unknownVariables.length > 0) {
    errors.push(`Variáveis não permitidas para este contexto: ${unknownVariables.map((item) => `{{${item}}}`).join(', ')}.`);
  }
  if (malformedCompletePlaceholder || hasUnbalancedPlaceholder) {
    errors.push('Existe uma variável com formato inválido.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedName,
    normalizedContent,
    contextType,
    variables,
    unknownVariables
  };
}

export function assertValidWhatsAppCustomMessage(input: WhatsAppCustomMessageInput) {
  const validation = validateWhatsAppCustomMessage(input);
  if (!validation.valid || !validation.contextType) {
    throw new WhatsAppCustomMessageValidationError(validation.errors);
  }
  return {
    name: validation.normalizedName,
    content: validation.normalizedContent,
    contextType: validation.contextType
  };
}

export class WhatsAppCustomMessageValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(errors[0] || 'Mensagem personalizada inválida.');
    this.name = 'WhatsAppCustomMessageValidationError';
    this.errors = errors;
  }
}
