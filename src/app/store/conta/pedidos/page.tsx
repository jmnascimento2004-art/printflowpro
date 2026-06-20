'use client';

import Link from 'next/link';
import { Eye, Package } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { useStoreCustomer } from '@/context/store-customer-context';
import { formatCurrency } from '@/lib/pricing';
import { getOrderStatusLabel } from '@/lib/store-customer';

export default function StoreOrdersPage() {
  const { orders } = useStoreCustomer();

  return (
    <StoreAccountShell title="Meus pedidos" subtitle="Veja o andamento dos pedidos vinculados a sua conta.">
      <div className="space-y-3">
        {orders.length > 0 ? orders.map((order) => (
          <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-slate-400">Pedido {order.number}</p>
                <h2 className="mt-1 text-base font-black text-slate-950">{getOrderStatusLabel(order.status)}</h2>
                <p className="text-xs font-semibold text-slate-500">
                  {new Date(order.created_at).toLocaleDateString('pt-BR')} - {order.items?.length || 0} itens
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-sm font-black text-slate-950">{formatCurrency(order.total_amount)}</span>
                <Link href={`/store/conta/pedidos/${order.id}`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white">
                  <Eye className="h-4 w-4" />
                  Detalhes
                </Link>
              </div>
            </div>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-500">Nenhum pedido encontrado para sua conta.</p>
          </div>
        )}
      </div>
    </StoreAccountShell>
  );
}
