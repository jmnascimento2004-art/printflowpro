'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ClipboardList,
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
    { label: 'Orcamentos enviados', value: quotes.length, icon: FileText },
    { label: 'Dados cadastrados', value: hasRegisteredData ? 'Sim' : 'Pendente', icon: UserRound }
  ];

  const actionCards = [
    {
      title: 'Meus pedidos',
      description: 'Acompanhe producao, entrega e historico de compras.',
      href: STORE_ROUTES.orders,
      icon: PackageSearch,
      featured: true,
      action: 'Ver pedidos'
    },
    {
      title: 'Meus orcamentos',
      description: 'Consulte solicitacoes enviadas e faca novos pedidos.',
      href: STORE_ROUTES.home,
      icon: FileText,
      action: 'Solicitar orcamento'
    },
    {
      title: 'Meus dados',
      description: 'Mantenha nome, documento e contato sempre atualizados.',
      href: STORE_ROUTES.profile,
      icon: UserRound,
      action: 'Editar dados'
    },
    {
      title: 'Enderecos',
      description: defaultAddress ? `${defaultAddress.city}/${defaultAddress.state}` : 'Cadastre enderecos para agilizar compras.',
      href: STORE_ROUTES.addresses,
      icon: MapPin,
      action: 'Gerenciar'
    },
    {
      title: 'Seguranca',
      description: 'Atualize sua senha e proteja o acesso a sua conta.',
      href: STORE_ROUTES.security,
      icon: LockKeyhole,
      action: 'Ver seguranca'
    }
  ];

  return (
    <StoreAccountShell title="Minha conta" subtitle="Gerencie seus dados, enderecos e pedidos." hidePageHeader>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Area do Cliente</p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-slate-950 md:text-4xl">
              Olá, {firstName} 👋
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              Bem-vindo à sua área do cliente.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Atalho principal</p>
            <p className="mt-2 text-lg font-black text-slate-950">Continue comprando</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Explore produtos personalizados, acompanhe seus pedidos e solicite novos orcamentos com facilidade.
            </p>
            <Link
              href={STORE_ROUTES.home}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-white transition hover:brightness-95"
              style={{ backgroundColor: primaryColor }}
            >
              Voltar ao catalogo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{card.label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50">
                  <Icon className="h-4 w-4" style={{ color: primaryColor }} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-950">{card.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {actionCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.featured ? 'border-blue-200 lg:col-span-2' : 'border-slate-200 lg:col-span-1'
              }`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: card.featured ? primaryColor : '#0f172a' }}>
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-base font-black text-slate-950">{card.title}</h2>
              <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-slate-500">{card.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-slate-950">
                {card.action}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>

      {lastOrder ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Ultimo pedido</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Pedido {lastOrder.number}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {getOrderStatusLabel(lastOrder.status)} - {formatCurrency(lastOrder.total_amount)}
              </p>
            </div>
            <Link
              href={`/store/conta/pedidos/${lastOrder.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Ver detalhes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
            <ShoppingBag className="h-7 w-7 text-slate-400" />
          </div>
          <h2 className="mt-4 text-xl font-black text-slate-950">Voce ainda nao possui pedidos.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
            Quando realizar uma compra ou solicitacao, ela aparecera aqui.
          </p>
          <Link
            href={STORE_ROUTES.home}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-xs font-black text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Ver produtos <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
            <ClipboardList className="h-5 w-5" style={{ color: primaryColor }} />
          </span>
          <div>
            <h2 className="text-base font-black text-slate-950">Tudo pronto para o proximo pedido</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Use os cards acima para acessar rapidamente pedidos, orcamentos, dados cadastrais, enderecos e seguranca.
            </p>
          </div>
        </div>
      </section>
    </StoreAccountShell>
  );
}
