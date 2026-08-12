import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import {
  assertValidWhatsAppCustomMessage,
  getWhatsAppCustomVariables,
  type WhatsAppCustomMessageInput
} from './custom-message-contract';
import type { WhatsAppCustomMessage, WhatsAppCustomMessageRow } from './types';

const CUSTOM_MESSAGE_COLUMNS = 'id,company_id,name,content,context_type,created_at,updated_at';

type PersistenceError = {
  code?: string;
  message?: string;
};

export type UpdateWhatsAppCustomMessageInput = WhatsAppCustomMessageInput & {
  expectedUpdatedAt?: string;
};

export type WhatsAppCustomMessageDataErrorCode =
  | 'DUPLICATE_NAME'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'PERSISTENCE_ERROR';

export class WhatsAppCustomMessageDataError extends Error {
  readonly code: WhatsAppCustomMessageDataErrorCode;
  readonly causeCode?: string;

  constructor(code: WhatsAppCustomMessageDataErrorCode, message: string, causeCode?: string) {
    super(message);
    this.name = 'WhatsAppCustomMessageDataError';
    this.code = code;
    this.causeCode = causeCode;
  }
}

function requireIdentifier(value: string, label: string) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new WhatsAppCustomMessageDataError('NOT_FOUND', `${label} inválido.`);
  return normalized;
}

function mapPersistenceError(error: PersistenceError): WhatsAppCustomMessageDataError {
  if (error.code === '23505') {
    return new WhatsAppCustomMessageDataError('DUPLICATE_NAME', 'Já existe uma mensagem com esse nome.', error.code);
  }
  if (error.code === '42501') {
    return new WhatsAppCustomMessageDataError('NOT_AUTHORIZED', 'Você não tem permissão para alterar mensagens personalizadas.', error.code);
  }
  if (error.code === 'PGRST116') {
    return new WhatsAppCustomMessageDataError('NOT_FOUND', 'Mensagem personalizada não encontrada.', error.code);
  }
  return new WhatsAppCustomMessageDataError('PERSISTENCE_ERROR', 'Não foi possível acessar as mensagens personalizadas.', error.code);
}

function toDomainMessage(row: WhatsAppCustomMessageRow): WhatsAppCustomMessage {
  return {
    kind: 'custom',
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    content: row.content,
    contextType: row.context_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    allowedVariables: getWhatsAppCustomVariables(row.context_type)
  };
}

export async function listWhatsAppCustomMessages(
  companyId: string,
  client: SupabaseClient = supabase
): Promise<WhatsAppCustomMessage[]> {
  const trustedCompanyId = requireIdentifier(companyId, 'Empresa');
  const { data, error } = await client
    .from('whatsapp_custom_messages')
    .select(CUSTOM_MESSAGE_COLUMNS)
    .eq('company_id', trustedCompanyId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) throw mapPersistenceError(error);
  return ((data || []) as WhatsAppCustomMessageRow[]).map(toDomainMessage);
}

export async function createWhatsAppCustomMessage(
  companyId: string,
  input: WhatsAppCustomMessageInput,
  client: SupabaseClient = supabase
): Promise<WhatsAppCustomMessage> {
  const trustedCompanyId = requireIdentifier(companyId, 'Empresa');
  const validated = assertValidWhatsAppCustomMessage(input);
  const { data, error } = await client
    .from('whatsapp_custom_messages')
    .insert({
      company_id: trustedCompanyId,
      name: validated.name,
      content: validated.content,
      context_type: validated.contextType
    })
    .select(CUSTOM_MESSAGE_COLUMNS)
    .single();

  if (error) throw mapPersistenceError(error);
  return toDomainMessage(data as WhatsAppCustomMessageRow);
}

export async function updateWhatsAppCustomMessage(
  companyId: string,
  id: string,
  input: UpdateWhatsAppCustomMessageInput,
  client: SupabaseClient = supabase
): Promise<WhatsAppCustomMessage> {
  const trustedCompanyId = requireIdentifier(companyId, 'Empresa');
  const trustedId = requireIdentifier(id, 'Mensagem');
  const validated = assertValidWhatsAppCustomMessage(input);
  let query = client
    .from('whatsapp_custom_messages')
    .update({
      name: validated.name,
      content: validated.content,
      context_type: validated.contextType
    })
    .eq('id', trustedId)
    .eq('company_id', trustedCompanyId);

  if (input.expectedUpdatedAt) query = query.eq('updated_at', input.expectedUpdatedAt);
  const { data, error } = await query.select(CUSTOM_MESSAGE_COLUMNS).single();

  if (error) throw mapPersistenceError(error);
  return toDomainMessage(data as WhatsAppCustomMessageRow);
}

export async function deleteWhatsAppCustomMessage(
  companyId: string,
  id: string,
  client: SupabaseClient = supabase
): Promise<string> {
  const trustedCompanyId = requireIdentifier(companyId, 'Empresa');
  const trustedId = requireIdentifier(id, 'Mensagem');
  const { data, error } = await client
    .from('whatsapp_custom_messages')
    .delete()
    .eq('id', trustedId)
    .eq('company_id', trustedCompanyId)
    .select('id')
    .maybeSingle();

  if (error) throw mapPersistenceError(error);
  if (!data) throw new WhatsAppCustomMessageDataError('NOT_FOUND', 'Mensagem personalizada não encontrada.');
  return String(data.id);
}
