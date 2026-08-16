export {
  buildWhatsAppUrl,
  extractWhatsAppTemplateVariables,
  normalizeWhatsAppPhone,
  normalizeWhatsAppTemplateContent,
  openWhatsAppUrl,
  renderConfiguredWhatsAppTemplate,
  renderWhatsAppTemplate,
  resolveWhatsAppPreviewVariables,
  validateWhatsAppTemplate,
  WHATSAPP_TEMPLATE_MAX_LENGTH
} from '@/lib/whatsapp/template-engine';

export {
  assertValidWhatsAppCustomMessage,
  getWhatsAppCustomVariables,
  isWhatsAppCustomMessageContext,
  renderWhatsAppCustomMessage,
  validateWhatsAppCustomMessage,
  WHATSAPP_CUSTOM_MESSAGE_CONTEXTS,
  WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH,
  WHATSAPP_CUSTOM_VARIABLES_BY_CONTEXT
} from '@/lib/whatsapp/custom-message-contract';

export type {
  WhatsAppCustomMessage,
  WhatsAppCustomMessageContext,
  WhatsAppCustomMessageRow
} from '@/lib/whatsapp/types';

import { normalizeWhatsAppPhone } from '@/lib/whatsapp/template-engine';

export function validateWhatsAppPhone(phone?: string | null): boolean {
  return normalizeWhatsAppPhone(phone).length > 0;
}
