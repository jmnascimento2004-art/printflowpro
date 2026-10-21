import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticatePdfRequest, getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';
import { canAccessModule } from '@/lib/module-permissions';
import { buildCommercialOverview, buildCustomerRanking } from '@/lib/commercial-intelligence';
import type { Customer, FinancialTransaction, Order, ProductionItem, Quote } from '@/lib/dummy-data';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
// Paginate each source, never one query per customer and never silently truncate at the API row limit.
async function rows<T>(client: SupabaseClient, table: string, companyId: string, select = '*'): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ;) {
    const { data, error, count } = await client.from(table).select(select, { count: 'exact' }).eq('company_id', companyId).order('id').range(offset, offset + 999);
    if (error) throw new Error('Não foi possível consultar os indicadores.');
    result.push(...(data || []) as unknown as T[]);
    if (!data?.length || (count !== null && result.length >= count)) return result;
    offset += data.length;
  }
}

export async function GET(request: Request) {
  try {
    const access = await authenticatePdfRequest(request);
    const client = getAuthenticatedPdfClient(request);
    const { data: permissionRows, error } = await client.from('role_permissions').select('path,roles').eq('company_id', access.companyId);
    if (error) throw error;
    const configured = Object.fromEntries((permissionRows || []).map(row => [row.path, row.roles]));
    const allowed = (path: string) => canAccessModule(access.role, path, configured);
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') || 'dashboard';
    if (!['dashboard', 'ranking'].includes(mode)) return NextResponse.json({ error: 'Visão inválida.' }, { status: 400, headers });
    if (!allowed(mode === 'ranking' ? '/crm' : '/dashboard') || (mode === 'ranking' && !allowed('/orders'))) return NextResponse.json({ error: 'Sem permissão para esta visão.' }, { status: 403, headers });
    const period = params.get('period') || (mode === 'ranking' ? '30' : '7');
    if (!(mode === 'ranking' ? ['30', '90', 'year', 'all'] : ['7', '30', '90']).includes(period)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400, headers });
    const permissions = Object.fromEntries(['/financial', '/orders', '/production', '/quotes', '/crm', '/products', '/pricing', '/pos'].map(path => [path, allowed(path)]));
    const [orders, customers, financial, quotes, production] = await Promise.all([
      (mode === 'ranking' || allowed('/orders') || allowed('/financial') || allowed('/production')) ? rows<Order & { order_items?: Order['items'] }>(client, 'orders', access.companyId, mode === 'dashboard' && allowed('/orders') ? '*,order_items(*)' : '*') : [],
      allowed('/crm') ? rows<Customer>(client, 'customers', access.companyId, 'id,company_id,name,document,tags,corporate_additional_info,billing_type,credit_status,created_at') : [],
      mode === 'dashboard' && allowed('/financial') ? rows<FinancialTransaction>(client, 'financial_transactions', access.companyId) : [],
      mode === 'dashboard' && allowed('/quotes') ? rows<Quote>(client, 'quotes', access.companyId, 'id,company_id,number,customer_id,customer_name,status,created_at') : [],
      mode === 'dashboard' && allowed('/production') ? rows<ProductionItem>(client, 'production_queue', access.companyId) : []
    ]);
    if (mode === 'ranking') return NextResponse.json({ ranking: buildCustomerRanking(customers, orders, period), permissions, period }, { headers });
    const overview = buildCommercialOverview({ orders: orders.map(order => ({ ...order, items: order.order_items || [] })), customers, financial, quotes, production }, Number(period));
    // Do not leak commercial/financial values merely because the user may open Dashboard.
    return NextResponse.json({ overview: {
      ...overview,
      ...(!allowed('/crm') || !allowed('/orders') || !allowed('/quotes') ? { catalogCustomers: [] } : {}),
      ...(!allowed('/financial') ? { incomeToday: null, incomeMonth: null, receivable: null, payable: null, overdueReceivables: null, chart: [] } : {}),
      ...(!allowed('/orders') ? { ordersToday: null, delayedCount: null, recentOrders: [], bestsellers: [] } : {}),
      ...(!allowed('/production') ? { productionCount: null } : {}),
      ...(!allowed('/quotes') ? { pendingQuotes: null, catalogLeads: [] } : {})
    }, permissions }, { headers });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
    return NextResponse.json({ error: status === 401 ? 'Entre novamente para continuar.' : 'Não foi possível carregar esta visão.' }, { status: [401, 403].includes(status) ? status : 500, headers });
  }
}
