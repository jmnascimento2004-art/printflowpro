import type { WhatsAppEventKey } from './variable-contract';

export type WhatsAppTemplateVariable = string;

export type WhatsAppTemplateCategory = 'Orçamentos' | 'Pedidos' | 'Produção' | 'Atendimento';

export interface WhatsAppTemplateDefinition {
  eventKey: WhatsAppEventKey;
  name: string;
  description: string;
  category: WhatsAppTemplateCategory;
  defaultContent: string;
  allowedVariables: readonly WhatsAppTemplateVariable[];
  sampleVariables: Readonly<Record<string, string>>;
  enabledByDefault: boolean;
}

export interface WhatsAppSystemMessageDefinition extends WhatsAppTemplateDefinition {
  kind: 'system';
}

export type WhatsAppCustomMessageContext = 'generic' | 'customer';

export interface WhatsAppCustomMessage {
  kind: 'custom';
  id: string;
  companyId: string;
  name: string;
  content: string;
  contextType: WhatsAppCustomMessageContext;
  createdAt: string;
  updatedAt: string;
  allowedVariables: readonly WhatsAppTemplateVariable[];
  eventKey?: never;
  event_key?: never;
}

export interface WhatsAppCustomMessageRow {
  id: string;
  company_id: string;
  name: string;
  content: string;
  context_type: WhatsAppCustomMessageContext;
  created_at: string;
  updated_at: string;
  eventKey?: never;
  event_key?: never;
}

export interface WhatsAppSystemMessageOverride {
  id: string;
  company_id: string;
  event_key: string;
  name: string;
  content: string;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppMessageTemplate = WhatsAppSystemMessageOverride;

export interface WhatsAppSystemMessage {
  kind: 'system';
  definition: WhatsAppSystemMessageDefinition;
  override: WhatsAppSystemMessageOverride | null;
  content: string;
  active: boolean;
  customized: boolean;
}

export type WhatsAppMessage = WhatsAppSystemMessage | WhatsAppCustomMessage;

export interface WhatsAppSettings {
  id?: string;
  company_id: string;
  country_code: string;
  business_phone: string | null;
  signature: string | null;
  open_mode: 'auto' | 'web' | 'app';
  confirm_before_open: boolean;
  include_company_name: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface WhatsAppResolvedTemplate {
  definition: WhatsAppSystemMessageDefinition;
  content: string;
  renderedContent: string;
  active: boolean;
  customized: boolean;
  settings: WhatsAppSettings;
  usedFallback: boolean;
}
