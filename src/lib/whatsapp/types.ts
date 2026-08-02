export type WhatsAppTemplateVariable = string;

export type WhatsAppTemplateCategory = 'Orçamentos' | 'Pedidos' | 'Produção' | 'Atendimento';

export interface WhatsAppTemplateDefinition {
  eventKey: string;
  name: string;
  description: string;
  category: WhatsAppTemplateCategory;
  defaultContent: string;
  allowedVariables: readonly WhatsAppTemplateVariable[];
  sampleVariables: Readonly<Record<string, string>>;
  enabledByDefault: boolean;
}

export interface WhatsAppMessageTemplate {
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
  definition: WhatsAppTemplateDefinition;
  content: string;
  renderedContent: string;
  active: boolean;
  customized: boolean;
  settings: WhatsAppSettings;
  usedFallback: boolean;
}
