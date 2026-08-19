import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductionItem } from '@/lib/dummy-data';
import { supabase } from '@/lib/supabaseClient';

export const PRODUCTION_STATUSES = [
  'fila',
  'producao',
  'impressao',
  'acabamento',
  'concluido',
  'expedicao',
  'entregue',
  'finalizado'
] as const;

export type ProductionMutationErrorCode =
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'INVALID_STATUS'
  | 'PERSISTENCE_ERROR';

export class ProductionMutationError extends Error {
  readonly code: ProductionMutationErrorCode;
  readonly latestItem?: ProductionItem;

  constructor(code: ProductionMutationErrorCode, message: string, latestItem?: ProductionItem) {
    super(message);
    this.name = 'ProductionMutationError';
    this.code = code;
    this.latestItem = latestItem;
  }
}

type AtomicStageResult = {
  result_status: 'UPDATED' | 'UNCHANGED' | 'CONFLICT' | 'NOT_FOUND' | 'NOT_AUTHORIZED' | 'INVALID_STATUS';
  item_id: string | null;
  item_company_id: string | null;
  item_order_id: string | null;
  item_order_number: string | null;
  item_order_item_id: string | null;
  item_product_name: string | null;
  item_quantity: number | string | null;
  item_status: ProductionItem['status'] | null;
  item_priority: ProductionItem['priority'] | null;
  item_deadline: string | null;
  item_responsible_name: string | null;
  item_started_at: string | null;
  item_finished_at: string | null;
  item_created_at: string | null;
  item_updated_at: string | null;
  audit_log_id: string | null;
};

const PRODUCTION_COLUMNS = [
  'id',
  'company_id',
  'order_id',
  'order_number',
  'order_item_id',
  'product_name',
  'quantity',
  'status',
  'priority',
  'deadline',
  'responsible_name',
  'started_at',
  'finished_at',
  'created_at',
  'updated_at'
].join(',');

function requireIdentifier(value: string, label: string) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ProductionMutationError('NOT_FOUND', `${label} inválido.`);
  return normalized;
}

function isProductionStatus(value: unknown): value is ProductionItem['status'] {
  return PRODUCTION_STATUSES.includes(value as ProductionItem['status']);
}

function toProductionItem(row: Record<string, unknown>): ProductionItem {
  if (
    !row.id
    || !row.company_id
    || !row.order_id
    || !row.order_number
    || !row.order_item_id
    || !row.product_name
    || !isProductionStatus(row.status)
    || !row.priority
    || !row.deadline
    || !row.created_at
  ) {
    throw new ProductionMutationError('PERSISTENCE_ERROR', 'A fila de produção retornou dados incompletos.');
  }

  return {
    id: String(row.id),
    company_id: String(row.company_id),
    order_id: String(row.order_id),
    order_number: String(row.order_number),
    order_item_id: String(row.order_item_id),
    product_name: String(row.product_name),
    quantity: Number(row.quantity || 0),
    status: row.status,
    priority: row.priority as ProductionItem['priority'],
    deadline: String(row.deadline),
    responsible_name: row.responsible_name ? String(row.responsible_name) : undefined,
    started_at: row.started_at ? String(row.started_at) : undefined,
    finished_at: row.finished_at ? String(row.finished_at) : undefined,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined
  };
}

function atomicResultToItem(result: AtomicStageResult): ProductionItem | undefined {
  if (!result.item_id) return undefined;
  return toProductionItem({
    id: result.item_id,
    company_id: result.item_company_id,
    order_id: result.item_order_id,
    order_number: result.item_order_number,
    order_item_id: result.item_order_item_id,
    product_name: result.item_product_name,
    quantity: result.item_quantity,
    status: result.item_status,
    priority: result.item_priority,
    deadline: result.item_deadline,
    responsible_name: result.item_responsible_name,
    started_at: result.item_started_at,
    finished_at: result.item_finished_at,
    created_at: result.item_created_at,
    updated_at: result.item_updated_at
  });
}

function mapPersistenceError(error: { code?: string } | null | undefined) {
  if (error?.code === '42501') {
    return new ProductionMutationError('NOT_AUTHORIZED', 'Você não tem permissão para alterar a fila de produção.');
  }
  return new ProductionMutationError('PERSISTENCE_ERROR', 'Não foi possível atualizar a fila de produção.');
}

export async function transitionProductionStage(
  id: string,
  nextStatus: ProductionItem['status'],
  expectedUpdatedAt: string,
  client: SupabaseClient = supabase
): Promise<ProductionItem> {
  const trustedId = requireIdentifier(id, 'Item');
  const trustedVersion = requireIdentifier(expectedUpdatedAt, 'Versão do item');
  if (!isProductionStatus(nextStatus)) {
    throw new ProductionMutationError('INVALID_STATUS', 'Fase de produção inválida.');
  }

  const { data, error } = await client.rpc('transition_production_stage', {
    p_item_id: trustedId,
    p_next_status: nextStatus,
    p_expected_updated_at: trustedVersion
  }).single();

  if (error) throw mapPersistenceError(error);
  const result = data as AtomicStageResult;
  const latestItem = atomicResultToItem(result);
  if ((result.result_status === 'UPDATED' || result.result_status === 'UNCHANGED') && latestItem) return latestItem;
  if (result.result_status === 'CONFLICT') {
    throw new ProductionMutationError(
      'CONFLICT',
      'Este item foi alterado por outra pessoa. A versão mais recente foi carregada.',
      latestItem
    );
  }
  if (result.result_status === 'NOT_FOUND') {
    throw new ProductionMutationError('NOT_FOUND', 'Item da fila de produção não encontrado.');
  }
  if (result.result_status === 'NOT_AUTHORIZED') {
    throw new ProductionMutationError('NOT_AUTHORIZED', 'Você não tem permissão para alterar a fila de produção.');
  }
  if (result.result_status === 'INVALID_STATUS') {
    throw new ProductionMutationError('INVALID_STATUS', 'Fase de produção inválida.');
  }
  throw new ProductionMutationError('PERSISTENCE_ERROR', 'Não foi possível validar a atualização da fila.');
}

export async function assignProductionResponsiblePersisted(
  companyId: string,
  item: ProductionItem,
  responsibleName: string,
  client: SupabaseClient = supabase
): Promise<ProductionItem> {
  const trustedCompanyId = requireIdentifier(companyId, 'Empresa');
  const trustedId = requireIdentifier(item.id, 'Item');
  const trustedVersion = requireIdentifier(item.updated_at || '', 'Versão do item');
  const normalizedName = String(responsibleName || '').trim();

  const { data, error } = await client
    .from('production_queue')
    .update({ responsible_name: normalizedName || null })
    .eq('id', trustedId)
    .eq('company_id', trustedCompanyId)
    .eq('updated_at', trustedVersion)
    .select(PRODUCTION_COLUMNS)
    .maybeSingle();

  if (error) throw mapPersistenceError(error);
  if (!data) {
    const { data: latestData } = await client
      .from('production_queue')
      .select(PRODUCTION_COLUMNS)
      .eq('id', trustedId)
      .eq('company_id', trustedCompanyId)
      .maybeSingle();
    const latestItem = latestData
      ? toProductionItem(latestData as unknown as Record<string, unknown>)
      : undefined;
    throw new ProductionMutationError(
      'CONFLICT',
      'Este item foi alterado por outra pessoa. A versão mais recente foi carregada.',
      latestItem
    );
  }
  return toProductionItem(data as unknown as Record<string, unknown>);
}

export async function ensureProductionQueueForOrder(
  orderId: string,
  client: SupabaseClient = supabase
): Promise<ProductionItem[]> {
  const trustedOrderId = requireIdentifier(orderId, 'Pedido');
  const { data, error } = await client.rpc('ensure_production_queue_for_order', {
    p_order_id: trustedOrderId
  });
  if (error) throw mapPersistenceError(error);
  return ((data || []) as Record<string, unknown>[]).map(toProductionItem);
}

export function replaceProductionItem(items: ProductionItem[], incoming: ProductionItem): ProductionItem[] {
  const index = items.findIndex((item) => item.id === incoming.id);
  if (index < 0) return [...items, incoming];
  const currentVersion = Date.parse(items[index].updated_at || '');
  const incomingVersion = Date.parse(incoming.updated_at || '');
  if (Number.isFinite(currentVersion) && Number.isFinite(incomingVersion) && incomingVersion < currentVersion) {
    return items;
  }
  const next = [...items];
  next[index] = incoming;
  return next;
}
