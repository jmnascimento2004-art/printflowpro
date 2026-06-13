'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  ShoppingBag, 
  Wrench, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Plus, 
  FileText, 
  Users, 
  Calculator 
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';

const CATALOG_INTERESTS_READ_KEY = 'printflow_catalog_interests_read_ids';
const CATALOG_INTERESTS_READ_EVENT = 'printflow_catalog_interests_read_change';

export default function DashboardPage() {
  const { orders, financial, products, customers, quotes } = useDatabase();
  const [readCatalogInterestIds, setReadCatalogInterestIds] = useState<string[]>([]);

  const loadReadCatalogInterestIds = () => {
    try {
      const stored = window.localStorage.getItem(CATALOG_INTERESTS_READ_KEY);
      setReadCatalogInterestIds(stored ? JSON.parse(stored) : []);
    } catch {
      setReadCatalogInterestIds([]);
    }
  };

  useEffect(() => {
    loadReadCatalogInterestIds();
    window.addEventListener(CATALOG_INTERESTS_READ_EVENT, loadReadCatalogInterestIds);
    return () => window.removeEventListener(CATALOG_INTERESTS_READ_EVENT, loadReadCatalogInterestIds);
  }, []);

  const markCatalogInterestAsRead = (id: string) => {
    setReadCatalogInterestIds((current) => {
      const next = Array.from(new Set([...current, id]));
      try {
        window.localStorage.setItem(CATALOG_INTERESTS_READ_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(CATALOG_INTERESTS_READ_EVENT));
      } catch {
        // localStorage unavailable; keep the in-memory read state for this session.
      }
      return next;
    });
  };

  // 1. Calculations based on database state
  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayStr = formatDateKey(new Date());
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const isCancelledOrder = (order: { status?: string; payment_status?: string }) => {
    const status = (order.status || '').trim().toLowerCase();
    const paymentStatus = (order.payment_status || '').trim().toLowerCase();
    return ['cancelado', 'cancelled', 'canceled'].includes(status) || paymentStatus === 'reembolsado';
  };
  const activeOrders = orders.filter(o => !isCancelledOrder(o));
  const normalizeKey = (value?: string) => (value || '').trim().toLowerCase();
  const cancelledOrderIds = new Set(orders.filter(o => isCancelledOrder(o)).map(o => normalizeKey(o.id)));
  const cancelledOrderNumbers = new Set(orders.filter(o => isCancelledOrder(o)).map(o => normalizeKey(o.number)));
  const isFromCancelledOrder = (entry: { order_id?: string; order_number?: string }) => (
    (!!entry.order_id && cancelledOrderIds.has(normalizeKey(entry.order_id))) ||
    (!!entry.order_number && cancelledOrderNumbers.has(normalizeKey(entry.order_number)))
  );
  const validFinancial = financial.filter(f => !isFromCancelledOrder(f));
  const paidIncomeTransactions = validFinancial.filter(f => normalizeKey(f.type) === 'receita' && normalizeKey(f.status) === 'pago');
  const pendingIncomeTransactions = validFinancial.filter(f => normalizeKey(f.type) === 'receita' && normalizeKey(f.status) === 'pendente');
  const getFinancialPaymentDate = (entry: { paid_at?: string; created_at: string }) => (
    new Date(entry.paid_at || entry.created_at)
  );
  const transactionMatchesOrder = (entry: { order_id?: string; order_number?: string }, order: { id: string; number: string }) => (
    normalizeKey(entry.order_id) === normalizeKey(order.id) ||
    normalizeKey(entry.order_number) === normalizeKey(order.number)
  );
  const getPaidIncomeForOrder = (order: { id: string; number: string }) => (
    paidIncomeTransactions
      .filter(f => transactionMatchesOrder(f, order))
      .reduce((sum, f) => sum + f.amount, 0)
  );

  // Sales Today: real paid income from financial flow, excluding cancelled orders
  const salesToday = paidIncomeTransactions
    .filter(f => formatDateKey(getFinancialPaymentDate(f)) === todayStr)
    .reduce((sum, f) => sum + f.amount, 0);

  // Sales Month: real paid income from all financial entries (orders, POS, manual), excluding cancelled orders
  const salesMonth = paidIncomeTransactions
    .filter(f => getFinancialPaymentDate(f) >= startOfMonth)
    .reduce((sum, f) => sum + f.amount, 0);

  // Production Orders
  const productionCount = orders.filter(o => ['producao', 'impressao', 'acabamento'].includes(o.status)).length;

  // Delayed Orders (Overdue deadline, active status)
  const delayedCount = orders.filter(o => {
    const isOverdue = new Date(o.deadline) < new Date() && !['entregue', 'finalizado', 'cancelado'].includes(o.status);
    return isOverdue;
  }).length;

  // Accounts Receivable: pending income registered in financial flow, excluding cancelled orders
  const accountsReceivable = pendingIncomeTransactions.reduce((sum, f) => sum + f.amount, 0);

  // Accounts Payable (due_date in future or past, status pendente for type despesa)
  const accountsPayable = validFinancial
    .filter(f => f.type === 'despesa' && f.status === 'pendente')
    .reduce((sum, f) => sum + f.amount, 0);

  // Financial summary
  const totalReceived = paidIncomeTransactions.reduce((sum, f) => sum + f.amount, 0);

  const totalPaid = validFinancial
    .filter(f => f.type === 'despesa' && f.status === 'pago')
    .reduce((sum, f) => sum + f.amount, 0);

  // Profit estimation (estimated based on average product margins or overall revenue - direct expenses)
  const estimatedProfit = salesMonth * 0.42; // standard 42% average net profit rate for prints

  // 2. Recent orders table
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const catalogQuoteLeads = [...quotes]
    .filter((quote) => {
      const customer = customers.find((item) => item.id === quote.customer_id);
      return (
        quote.status === 'pendente' &&
        (
          quote.customer_id.startsWith('cust-web-') ||
          quote.customer_name.includes('(Web)') ||
          customer?.tags?.includes('Catalogo Online')
        )
      );
    })
    .map((quote) => ({
      id: quote.id,
      customerName: quote.customer_name,
      createdAt: quote.created_at,
      amount: quote.total_amount,
      code: `#${quote.number}`,
      href: '/quotes',
      description: 'Orçamento do catalogo aguardando atendimento'
    }));

  const quotedCatalogCustomerIds = new Set(catalogQuoteLeads.map((lead) => {
    const quote = quotes.find((item) => item.id === lead.id);
    return quote?.customer_id;
  }));

  const catalogCustomerLeads = customers
    .filter((customer) => {
      const isCatalogCustomer =
        customer.id.startsWith('cust-web-') ||
        customer.tags?.includes('Catalogo Online') ||
        customer.tags?.includes('Catalogo');

      return isCatalogCustomer && !quotedCatalogCustomerIds.has(customer.id);
    })
    .map((customer) => ({
      id: customer.id,
      customerName: customer.name,
      createdAt: customer.created_at,
      amount: null,
      code: 'CRM',
      href: '/crm',
      description: 'Cliente do catalogo aguardando atendimento'
    }));

  const catalogLeads = [...catalogQuoteLeads, ...catalogCustomerLeads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadCatalogLeads = catalogLeads.filter((lead) => !readCatalogInterestIds.includes(lead.id));
  const recentCatalogLeads = unreadCatalogLeads.slice(0, 4);

  // 3. Bestselling products (simulated based on orders data or static if empty, computed dynamically)
  const getBestsellers = () => {
    const counts: Record<string, { qty: number; val: number }> = {};
    activeOrders.forEach(o => {
      const paidAmount = getPaidIncomeForOrder(o);
      if (paidAmount <= 0) return;

      const itemsTotal = o.items.reduce((sum, item) => sum + Number(item.total_price), 0);
      o.items.forEach(i => {
        if (!counts[i.product_name]) {
          counts[i.product_name] = { qty: 0, val: 0 };
        }
        counts[i.product_name].qty += Number(i.quantity);
        counts[i.product_name].val += itemsTotal > 0
          ? (paidAmount * Number(i.total_price)) / itemsTotal
          : Number(i.total_price);
      });
    });

    return Object.entries(counts)
      .map(([name, data]) => ({ name, quantity: data.qty, sales: data.val }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 4);
  };

  const bestsellers = getBestsellers();

  // Formatting utilities
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      orcamento: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      aguardando_aprovacao: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      aguardando_pagamento: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      producao: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      impressao: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      acabamento: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      expedicao: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      entregue: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      finalizado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      cancelado: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };

    const labels: Record<string, string> = {
      orcamento: 'Orçamento',
      aguardando_aprovacao: 'Aguardando Aprov.',
      aguardando_pagamento: 'Aguardando Pag.',
      producao: 'Produção',
      impressao: 'Impressão',
      acabamento: 'Acabamento',
      expedicao: 'Expedição',
      entregue: 'Entregue',
      finalizado: 'Finalizado',
      cancelado: 'Cancelado',
    };

    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] || ''}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Quick Welcome banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-primary/10 to-indigo-500/10 border border-primary/20 rounded-2xl p-5 md:p-6 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            Bem-vindo ao Painel Executivo
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aqui está o resumo operacional e financeiro da sua gráfica para hoje.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/quotes"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold shadow-md shadow-primary/20 transition-all shrink-0"
          >
            <Plus className="h-4 w-4" /> Novo Orçamento
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border hover:bg-secondary text-foreground text-sm font-semibold transition-all shrink-0"
          >
            <Calculator className="h-4 w-4" /> Precificar m²
          </Link>
        </div>
      </div>

      {unreadCatalogLeads.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-black text-foreground uppercase tracking-wide">
                    Interesse de compra no catalogo
                  </h3>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-black">
                    {unreadCatalogLeads.length} novo{unreadCatalogLeads.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Orçamentos enviados pela loja online aguardando atendimento comercial.
                </p>
              </div>
            </div>

            <Link
              href={catalogQuoteLeads.length > 0 ? '/quotes' : '/crm'}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-sm font-bold shadow-sm transition-all"
            >
              Ver interesses <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            {recentCatalogLeads.map((lead) => (
              <Link
                key={lead.id}
                href={lead.href}
                onClick={() => markCatalogInterestAsRead(lead.id)}
                className="block rounded-xl bg-card border border-amber-500/20 p-3 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground truncate">{lead.customerName}</span>
                  <span className="text-[10px] font-black text-amber-600">{lead.code}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
                  <span className="font-bold text-foreground">{lead.amount !== null ? formatCurrency(lead.amount) : 'CRM'}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 truncate">{lead.description}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 2. Key Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Card */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faturamento Mês</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{formatCurrency(salesMonth)}</h3>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] text-muted-foreground">Hoje:</span>
              <span className="text-xs font-semibold text-emerald-500 flex items-center">
                {formatCurrency(salesToday)} <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Production Card */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fila de Produção</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{productionCount}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-muted-foreground">Atrasados:</span>
              <span className={`text-xs font-semibold flex items-center ${delayedCount > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>
                {delayedCount} {delayedCount > 0 ? <AlertTriangle className="h-3 w-3 ml-0.5" /> : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Finance Receivables */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contas a Receber</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{formatCurrency(accountsReceivable)}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-muted-foreground">Pagar (Previsto):</span>
              <span className="text-xs font-semibold text-amber-500">
                {formatCurrency(accountsPayable)}
              </span>
            </div>
          </div>
        </div>

        {/* Profitability Estimator */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-cyan-500/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lucro Est. (Mensal)</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{formatCurrency(estimatedProfit)}</h3>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] text-muted-foreground">Margem Média:</span>
              <span className="text-xs font-semibold text-cyan-500">42% (Bruto)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Graph & Workflow Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow Line Chart */}
        <div className="bg-card border border-border rounded-2xl p-5 lg:col-span-2 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Fluxo de Caixa</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Visão de Entradas vs. Saídas nas últimas semanas</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Receitas: {formatCurrency(totalReceived)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span>Despesas: {formatCurrency(totalPaid)}</span>
              </div>
            </div>
          </div>
          
          {/* Custom SVG Line Chart to avoid compilation issues and load instantly */}
          <div className="h-56 w-full flex items-end justify-center pt-4 relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
              <div className="border-b border-border w-full h-0" />
              <div className="border-b border-border w-full h-0" />
              <div className="border-b border-border w-full h-0" />
              <div className="border-b border-border w-full h-0" />
            </div>

            {/* SVG lines */}
            <svg className="w-full h-full absolute inset-0 z-10" viewBox="0 0 600 200" preserveAspectRatio="none">
              {/* Receipts Line (Green) */}
              <path
                d="M 50 150 Q 150 100, 250 80 T 450 60 T 550 40"
                fill="none"
                stroke="rgb(16, 185, 129)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M 50 150 Q 150 100, 250 80 T 450 60 T 550 40 L 550 200 L 50 200 Z"
                fill="url(#green-gradient)"
                opacity="0.08"
              />

              {/* Expenses Line (Red) */}
              <path
                d="M 50 180 Q 150 160, 250 150 T 450 120 T 550 110"
                fill="none"
                stroke="rgb(244, 63, 94)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M 50 180 Q 150 160, 250 150 T 450 120 T 550 110 L 550 200 L 50 200 Z"
                fill="url(#red-gradient)"
                opacity="0.05"
              />

              {/* Definitions */}
              <defs>
                <linearGradient id="green-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="red-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(244, 63, 94)" />
                  <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>

            {/* Labels */}
            <div className="absolute bottom-0 w-full flex justify-between px-2 text-[10px] text-muted-foreground font-semibold z-20">
              <span>Semana 1</span>
              <span>Semana 2</span>
              <span>Semana 3</span>
              <span>Semana 4</span>
              <span>Semana 5 (Atual)</span>
            </div>
          </div>
        </div>

        {/* Side summary of bestsellers */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wide mb-4">Mais Vendidos</h3>
            <div className="space-y-4">
              {bestsellers.length > 0 ? (
                bestsellers.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[170px]">{item.name}</span>
                      <span className="font-medium text-muted-foreground">{formatCurrency(item.sales)}</span>
                    </div>
                    {/* Progress indicator */}
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${idx === 0 ? 'bg-primary' : 'bg-primary/60'}`}
                        style={{ width: `${Math.min(100, (item.sales / (bestsellers[0]?.sales || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhum produto vendido ainda.</p>
              )}
            </div>
          </div>
          
          <div className="border-t border-border mt-4 pt-3 flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">Dados dinâmicos da plataforma</span>
            <Link href="/pricing" className="text-xs font-semibold text-primary hover:underline">
              Ir para Precificação
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Recent Orders Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <div>
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Últimos Pedidos</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Operações recentes em andamento no ERP</p>
          </div>
          <Link href="/orders" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Ver Todos <Plus className="h-3 w-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Prazo de Entrega</th>
                <th className="px-5 py-3 text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-secondary/35 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-foreground">{order.number}</td>
                  <td className="px-5 py-3.5 text-muted-foreground font-semibold">{order.customer_name}</td>
                  <td className="px-5 py-3.5">{getStatusBadge(order.status)}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {new Date(order.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-foreground">{formatCurrency(order.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
