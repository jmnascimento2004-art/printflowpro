'use client';

import Link from 'next/link';
import { ArrowRight, MapPin, Package, ShoppingBag, UserRound } from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { useStoreCustomer } from '@/context/store-customer-context';
import { formatCurrency } from '@/lib/pricing';
import { getOrderStatusLabel } from '@/lib/store-customer';

export default function StoreAccountHomePage() {
  const { customer, orders, quotes, defaultAddress } = useStoreCustomer();
  const lastOrder = orders[0];
  const openOrders = orders.filter((order) => !['entregue', 'finalizado', 'cancelado'].includes(order.status)).length;

  return (
    <StoreAccountShell title="Minha conta" subtitle="Gerencie seus dados, enderecos e pedidos.">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Bem-vindo</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">Ola, {customer?.name?.split(' ')[0] || 'cliente'}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          Use o menu da conta para acompanhar pedidos, atualizar seus dados, gerenciar enderecos e revisar preferencias.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">Pedidos</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">Em andamento</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{openOrders}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">Orcamentos</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{quotes.length}</p>
        </div>
      </div>

      {lastOrder ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-slate-400">Ultimo pedido</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Pedido {lastOrder.number}</h2>
              <p className="text-sm font-semibold text-slate-500">
                {getOrderStatusLabel(lastOrder.status)} - {formatCurrency(lastOrder.total_amount)}
              </p>
            </div>
            <Link href={`/store/conta/pedidos/${lastOrder.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white">
              Ver detalhes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-500">Voce ainda nao tem pedidos vinculados a esta conta.</p>
          <Link href="/store" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-xs font-black text-white">
            Continuar comprando
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/store/conta/perfil" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
          <UserRound className="h-5 w-5 text-slate-500" />
          <p className="mt-3 text-sm font-black text-slate-950">Editar perfil</p>
        </Link>
        <Link href="/store/conta/enderecos" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
          <MapPin className="h-5 w-5 text-slate-500" />
          <p className="mt-3 text-sm font-black text-slate-950">Enderecos</p>
          {defaultAddress && <p className="mt-1 truncate text-xs font-semibold text-slate-400">{defaultAddress.city}/{defaultAddress.state}</p>}
        </Link>
        <Link href="/store/conta/pedidos" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
          <Package className="h-5 w-5 text-slate-500" />
          <p className="mt-3 text-sm font-black text-slate-950">Meus pedidos</p>
        </Link>
      </div>
    </StoreAccountShell>
  );
}
