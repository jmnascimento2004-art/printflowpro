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
  expectedUpdatedAt: string;
};

export type WhatsAppCustomMessageDataErrorCode =
  | 'DUPLICATE_NAME'
  | 'CONFLICT'
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
  return new WhatsAppCustomMessageDataError('PERSISTENCE_ERROR', 'Não foi possível acessar as mensagens personalizadas.', error.code);
}

type AtomicUpdateStatus = 'UPDATED' | 'CONFLICT' | 'NOT_FOUND' | 'NOT_AUTHORIZED';

type AtomicUpdateResult = {
  result_status: AtomicUpdateStatus;
  message_id: string | null;
  message_company_id: string | null;
  message_name: string | null;
  message_content: string | null;
  message_context_type: WhatsAppCustomMessageRow['context_type'] | null;
  message_created_at: string | null;
  message_updated_at: string | null;
};

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

function toDomainAtomicUpdate(result: AtomicUpdateResult): WhatsAppCustomMessage {
  if (
    !result.message_id
    || !result.message_company_id
    || result.message_name === null
    || result.message_content === null
    || !result.message_context_type
    || !result.message_created_at
    || !result.message_updated_at
  ) {
    throw new WhatsAppCustomMessageDataError(
      'PERSISTENCE_ERROR',
      'Não foi possível validar a mensagem personalizada atualizada.'
    );
  }

  return toDomainMessage({
    id: result.message_id,
    company_id: result.message_company_id,
    name: result.message_name,
    content: result.message_content,
    context_type: result.message_context_type,
    created_at: result.message_created_at,
    updated_at: result.message_updated_at
  });
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
  requireIdentifier(companyId, 'Empresa');
  const trustedId = requireIdentifier(id, 'Mensagem');
  const trustedExpectedUpdatedAt = requireIdentifier(input.expectedUpdatedAt, 'Versão da mensagem');
  const validated = assertValidWhatsAppCustomMessage(input);
  const { data, error } = await client
    .rpc('update_whatsapp_custom_message_atomic', {
      p_message_id: trustedId,
      p_name: validated.name,
      p_content: validated.content,
      p_context_type: validated.contextType,
      p_expected_updated_at: trustedExpectedUpdatedAt
    })
    .single();

  if (error) throw mapPersistenceError(error);
  const result = data as AtomicUpdateResult;
  if (result.result_status === 'UPDATED') return toDomainAtomicUpdate(result);
  if (result.result_status === 'CONFLICT') {
    throw new WhatsAppCustomMessageDataError(
      'CONFLICT',
      'A mensagem foi alterada por outro usuário. Recarregue os dados antes de salvar novamente.'
    );
  }
  if (result.result_status === 'NOT_FOUND') {
    throw new WhatsAppCustomMessageDataError('NOT_FOUND', 'Mensagem personalizada não encontrada.');
  }
  if (result.result_status === 'NOT_AUTHORIZED') {
    throw new WhatsAppCustomMessageDataError(
      'NOT_AUTHORIZED',
      'Você não tem permissão para alterar mensagens personalizadas.'
    );
  }
  throw new WhatsAppCustomMessageDataError(
    'PERSISTENCE_ERROR',
    'Não foi possível acessar as mensagens personalizadas.'
  );
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
