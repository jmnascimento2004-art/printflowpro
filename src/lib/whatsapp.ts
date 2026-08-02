export {
  buildWhatsAppUrl,
  extractWhatsAppTemplateVariables,
  normalizeWhatsAppPhone,
  normalizeWhatsAppTemplateContent,
  openWhatsAppUrl,
  renderConfiguredWhatsAppTemplate,
  renderWhatsAppTemplate,
  validateWhatsAppTemplate,
  WHATSAPP_TEMPLATE_MAX_LENGTH
} from '@/lib/whatsapp/template-engine';

import { normalizeWhatsAppPhone } from '@/lib/whatsapp/template-engine';

export function validateWhatsAppPhone(phone?: string | null): boolean {
  return normalizeWhatsAppPhone(phone).length > 0;
}
