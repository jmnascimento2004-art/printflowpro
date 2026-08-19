import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type PersistenceErrorCode =
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'INVALID_INPUT'
  | 'INSUFFICIENT_STOCK'
  | 'INSUFFICIENT_CASH'
  | 'PERSISTENCE_ERROR';

export class PersistenceMutationError<T = unknown> extends Error {
  readonly code: PersistenceErrorCode;
  readonly latest?: T;

  constructor(code: PersistenceErrorCode, message: string, latest?: T) {
    super(message);
    this.name = 'PersistenceMutationError';
    this.code = code;
    this.latest = latest;
  }
}

type RpcResult = {
  status?: string;
  [key: string]: unknown;
};

const STATUS_MESSAGES: Record<string, string> = {
  CONFLICT: 'Este registro foi alterado em outra sessão. A versão mais recente foi carregada.',
  NOT_FOUND: 'O registro não foi encontrado ou não pertence à sua empresa.',
  NOT_AUTHORIZED: 'Você não tem permissão para concluir esta operação.',
  INVALID_INPUT: 'Os dados informados para esta operação são inválidos.',
  INSUFFICIENT_STOCK: 'O estoque disponível não permite esta saída.',
  INSUFFICIENT_CASH: 'O saldo esperado do caixa não permite esta sangria.'
};

function mapClientError(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === '42501') {
    return new PersistenceMutationError('NOT_AUTHORIZED', STATUS_MESSAGES.NOT_AUTHORIZED);
  }
  return new PersistenceMutationError('PERSISTENCE_ERROR', 'Não foi possível persistir a alteração. Tente novamente.');
}

function requireRpcSuccess<T extends RpcResult>(result: T, latestKey?: string): T {
  const status = String(result?.status || 'PERSISTENCE_ERROR');
  if (status === 'UPDATED' || status === 'UNCHANGED') return result;
  const code = status in STATUS_MESSAGES ? status as PersistenceErrorCode : 'PERSISTENCE_ERROR';
  throw new PersistenceMutationError(code, STATUS_MESSAGES[status] || 'Não foi possível validar a alteração.', latestKey ? result[latestKey] : undefined);
}

async function runRpc<T extends RpcResult>(
  name: string,
  args: Record<string, unknown>,
  latestKey?: string,
  client: SupabaseClient = supabase
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw mapClientError(error);
  if (!data || typeof data !== 'object') {
    throw new PersistenceMutationError('PERSISTENCE_ERROR', 'O servidor retornou uma resposta incompleta.');
  }
  return requireRpcSuccess(data as T, latestKey);
}

export async function insertTenantRecord<T extends object>(
  table: string,
  row: T,
  client: SupabaseClient = supabase
): Promise<T> {
  const { data, error } = await client.from(table).insert(row as Record<string, unknown>).select('*').single();
  if (error) throw mapClientError(error);
  return data as T;
}

export async function patchTenantRecord<T extends object>(
  table: string,
  id: string,
  companyId: string,
  patch: Record<string, unknown>,
  options: { idColumn?: string; companyColumn?: string; expectedUpdatedAt?: string } = {},
  client: SupabaseClient = supabase
): Promise<T> {
  const idColumn = options.idColumn || 'id';
  const companyColumn = options.companyColumn || 'company_id';
  let query = client.from(table).update(patch).eq(idColumn, id).eq(companyColumn, companyId);
  if (options.expectedUpdatedAt) query = query.eq('updated_at', options.expectedUpdatedAt);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw mapClientError(error);
  if (data) return data as T;

  const { data: latest } = await client
    .from(table)
    .select('*')
    .eq(idColumn, id)
    .eq(companyColumn, companyId)
    .maybeSingle();
  throw new PersistenceMutationError(
    latest ? 'CONFLICT' : 'NOT_FOUND',
    latest ? STATUS_MESSAGES.CONFLICT : STATUS_MESSAGES.NOT_FOUND,
    latest as T | undefined
  );
}

export async function deleteTenantRecord(
  table: string,
  id: string,
  companyId: string,
  options: { idColumn?: string; expectedUpdatedAt?: string } = {},
  client: SupabaseClient = supabase
): Promise<void> {
  const idColumn = options.idColumn || 'id';
  let query = client.from(table).delete().eq(idColumn, id).eq('company_id', companyId);
  if (options.expectedUpdatedAt) query = query.eq('updated_at', options.expectedUpdatedAt);
  const { data, error } = await query.select(idColumn).maybeSingle();
  if (error) throw mapClientError(error);
  if (!data) throw new PersistenceMutationError('CONFLICT', STATUS_MESSAGES.CONFLICT);
}

export async function adjustInventoryStock<TProduct, TMovement>(args: {
  productId: string;
  quantity: number;
  type: 'entrada' | 'saida';
  reason: string;
  unitCost?: number;
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<{ product: TProduct; movement: TMovement }> {
  const result = await runRpc<RpcResult & { product: TProduct; movement: TMovement }>('adjust_inventory_stock', {
    p_product_id: args.productId,
    p_quantity: args.quantity,
    p_type: args.type,
    p_reason: args.reason,
    p_unit_cost: args.unitCost ?? null,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'product', client);
  return { product: result.product, movement: result.movement };
}

export async function transitionShipment<TShipment>(args: {
  shipmentId: string;
  status: string;
  trackingCode?: string;
  carrier?: string;
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<TShipment> {
  const result = await runRpc<RpcResult & { shipment: TShipment }>('transition_shipment', {
    p_shipment_id: args.shipmentId,
    p_status: args.status,
    p_tracking_code: args.trackingCode ?? null,
    p_carrier: args.carrier ?? null,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'shipment', client);
  return result.shipment;
}

export async function settleFinancialTransaction<TTransaction>(args: {
  transactionId: string;
  status: 'pendente' | 'pago';
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<TTransaction> {
  const result = await runRpc<RpcResult & { transaction: TTransaction }>('settle_financial_transaction', {
    p_transaction_id: args.transactionId,
    p_status: args.status,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'transaction', client);
  return result.transaction;
}

export async function operateCashRegister<TSession, TTransaction>(args: {
  operation: 'open' | 'close' | 'suprimento' | 'sangria';
  amount: number;
  description?: string;
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<{ session: TSession; transaction: TTransaction }> {
  const result = await runRpc<RpcResult & { session: TSession; transaction: TTransaction }>('operate_cash_register', {
    p_operation: args.operation,
    p_amount: args.amount,
    p_description: args.description ?? null,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'session', client);
  return { session: result.session, transaction: result.transaction };
}

export async function saveRolePermissions<TPermission>(
  permissions: Record<string, string[]>,
  expectedVersions: Record<string, string>,
  client: SupabaseClient = supabase
): Promise<TPermission[]> {
  const result = await runRpc<RpcResult & { permissions: TPermission[] }>('save_role_permissions', {
    p_permissions: permissions,
    p_expected_versions: expectedVersions
  }, 'permissions', client);
  return result.permissions;
}

export async function transitionOrderStatus<TOrder, TShipment>(args: {
  orderId: string;
  status: string;
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<{ order: TOrder; shipment?: TShipment }> {
  const result = await runRpc<RpcResult & { order: TOrder; shipment?: TShipment }>('transition_order_status_phase4b', {
    p_order_id: args.orderId,
    p_status: args.status,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'order', client);
  return { order: result.order, shipment: result.shipment || undefined };
}

export async function recordOrderPayment<TOrder, TFinancial, TCustomer, TSession, TRegister>(args: {
  orderId: string;
  amount: number;
  method: string;
  paymentType?: string;
  paidAt?: string;
  notes?: string;
  expectedUpdatedAt?: string;
}, client: SupabaseClient = supabase): Promise<{
  order: TOrder;
  financial: TFinancial;
  customer?: TCustomer;
  session?: TSession;
  registerTransaction?: TRegister;
}> {
  const result = await runRpc<RpcResult & {
    order: TOrder;
    financial: TFinancial;
    customer?: TCustomer;
    session?: TSession;
    register_transaction?: TRegister;
  }>('record_order_payment_phase4b', {
    p_order_id: args.orderId,
    p_amount: args.amount,
    p_method: args.method,
    p_payment_type: args.paymentType ?? null,
    p_paid_at: args.paidAt ?? null,
    p_notes: args.notes ?? null,
    p_expected_updated_at: args.expectedUpdatedAt ?? null
  }, 'order', client);
  return {
    order: result.order,
    financial: result.financial,
    customer: result.customer,
    session: result.session,
    registerTransaction: result.register_transaction
  };
}
