'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { useStoreCustomer } from '@/context/store-customer-context';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { formatCurrency } from '@/lib/pricing';
import { getOrderStatusLabel } from '@/lib/store-customer';

export default function StoreOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { orders, isLoading } = useStoreCustomer();
  const order = orders.find((item) => item.id === params.id);

  if (!isLoading && !order) notFound();

  return (
    <StoreAccountShell title={order ? `Pedido ${formatOrderDisplayNumber(order.number)}` : 'Pedido'} subtitle="Detalhes do pedido e status atual.">
      {order && (
        <div className="space-y-4">
          <Link href="/store/conta/pedidos" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" />
            Voltar aos pedidos
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Status</p>
                <p className="mt-1 text-sm font-black text-slate-950">{getOrderStatusLabel(order.status)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Data</p>
                <p className="mt-1 text-sm font-black text-slate-950">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Pagamento</p>
                <p className="mt-1 text-sm font-black text-slate-950">{order.payment_status}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Total</p>
                <p className="mt-1 text-sm font-black text-slate-950">{formatCurrency(order.total_amount)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase text-slate-950">Itens</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-black text-slate-900">{item.product_name}</p>
                    <p className="text-xs font-semibold text-slate-500">Quantidade: {item.quantity}</p>
                  </div>
                  <p className="whitespace-nowrap font-black text-slate-950">{formatCurrency(item.total_price)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase text-slate-950">Entrega / retirada</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {order.delivery_type || 'retirada'} {order.delivery_address ? `- ${order.delivery_address}` : ''}
            </p>
            {order.notes && <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{order.notes}</p>}
          </div>
        </div>
      )}
    </StoreAccountShell>
  );
}
