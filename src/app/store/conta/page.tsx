'use client';

import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  LockKeyhole,
  MapPin,
  Package,
  PackageSearch,
  ShoppingBag,
  UserRound
} from 'lucide-react';
import { StoreAccountShell } from '@/components/store/StoreAccountShell';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { formatCurrency } from '@/lib/pricing';
import { getOrderStatusLabel } from '@/lib/store-customer';
import { STORE_ROUTES } from '@/lib/store-routes';

const normalizePrimaryColor = (color?: string) => {
  if (!color) return '#1d35c9';
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const palette: Record<string, string> = {
    blue: '#1d35c9',
    violet: '#5b3df4',
    purple: '#5b3df4',
    emerald: '#059669',
    green: '#059669',
    red: '#dc2626',
    orange: '#ea580c'
  };
  return palette[color.toLowerCase()] || '#1d35c9';
};

export default function StoreAccountHomePage() {
  const { company } = useDatabase();
  const { customer, orders, quotes, defaultAddress } = useStoreCustomer();
  const primaryColor = normalizePrimaryColor(company.theme_color);
  const firstName = customer?.name?.split(' ')[0] || 'cliente';
  const lastOrder = orders[0];
  const openOrders = orders.filter((order) => !['entregue', 'finalizado', 'cancelado'].includes(order.status)).length;
  const hasRegisteredData = Boolean(customer?.name && customer?.email);

  const summaryCards = [
    { label: 'Pedidos realizados', value: orders.length, icon: Package },
    { label: 'Pedidos em andamento', value: openOrders, icon: PackageSearch },
    { label: 'Orçamentos enviados', value: quotes.length, icon: FileText },
    { label: 'Dados cadastrados', value: hasRegisteredData ? 'Sim' : 'Pendente', icon: UserRound }
  ];

  const actionCards = [
    {
      title: 'Meus pedidos',
      description: 'Acompanhe produção, entrega e histórico de compras.',
      href: STORE_ROUTES.orders,
      icon: PackageSearch,
      featured: true,
      action: 'Ver pedidos'
    },
    {
      title: 'Meus orçamentos',
      description: 'Consulte solicitações enviadas e faça novos pedidos.',
      href: STORE_ROUTES.home,
      icon: FileText,
      action: 'Solicitar orçamento'
    },
    {
      title: 'Meus dados',
      description: 'Mantenha nome, documento e contato sempre atualizados.',
      href: STORE_ROUTES.profile,
      icon: UserRound,
      action: 'Editar dados'
    },
    {
      title: 'Endereços',
      description: defaultAddress ? `${defaultAddress.city}/${defaultAddress.state}` : 'Cadastre endereços para agilizar suas compras.',
      href: STORE_ROUTES.addresses,
      icon: MapPin,
      action: 'Gerenciar'
    },
    {
      title: 'Segurança',
      description: 'Atualize sua senha e proteja o acesso à sua conta.',
      href: STORE_ROUTES.security,
      icon: LockKeyhole,
      action: 'Ver segurança'
    }
  ];

  return (
    <StoreAccountShell title="Minha conta" subtitle="Gerencie seus dados, endereços e pedidos." hidePageHeader>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Área do Cliente</p>
            <h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-slate-950 md:text-2xl">
              Olá, {firstName} 👋
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-5 text-slate-500">
              Bem-vindo à sua área do cliente.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Atalho principal</p>
            <p className="mt-1 text-base font-black text-slate-950">Continue comprando</p>
            <p className="mt-1 text-xs font-semibold leading-4 text-slate-500">
              Explore produtos personalizados, acompanhe seus pedidos e solicite novos orçamentos com facilidade.
            </p>
            <Link
              href={STORE_ROUTES.home}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-black text-white transition hover:brightness-95"
              style={{ backgroundColor: primaryColor }}
            >
              Voltar ao catálogo <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="h-[96px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{card.label}</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                  <Icon className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actionCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className={`group min-h-[148px] rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.featured ? 'border-blue-200' : 'border-slate-200'
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: card.featured ? primaryColor : '#0f172a' }}>
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-2 text-sm font-black text-slate-950">{card.title}</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{card.description}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black text-slate-950">
                {card.action}
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>

      {lastOrder ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Último pedido</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Pedido {formatOrderDisplayNumber(lastOrder.number)}</h2>
              <p className="mt-0.5 text-sm font-semibold text-slate-500">
                {getOrderStatusLabel(lastOrder.status)} - {formatCurrency(lastOrder.total_amount)}
              </p>
            </div>
            <Link
              href={`/store/conta/pedidos/${lastOrder.id}`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-black text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Ver detalhes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
            <ShoppingBag className="h-5 w-5 text-slate-400" />
          </div>
          <h2 className="mt-3 text-lg font-black text-slate-950">Você ainda não possui pedidos.</h2>
          <p className="mx-auto mt-1 max-w-md text-sm font-semibold leading-5 text-slate-500">
            Quando realizar uma compra ou solicitação, ela aparecerá aqui.
          </p>
          <Link
            href={STORE_ROUTES.home}
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-black text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Ver produtos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}
    </StoreAccountShell>
  );
}
