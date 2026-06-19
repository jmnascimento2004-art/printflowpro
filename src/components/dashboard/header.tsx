'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell, ChevronDown, ChevronLeft, ChevronRight, FileText, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDatabase } from '@/context/database-context';
import { UserProfile } from '@/lib/dummy-data';

const CATALOG_INTERESTS_READ_KEY = 'printflow_catalog_interests_read_ids';
const CATALOG_INTERESTS_READ_EVENT = 'printflow_catalog_interests_read_change';

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  activeProfile,
  setActiveProfile,
  logout
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeProfile: UserProfile;
  setActiveProfile: (profile: UserProfile) => void;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { company, customers, quotes } = useDatabase();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
      code: `#${quote.number}`,
      href: '/quotes',
      description: 'Novo orçamento do catalogo aguardando atendimento.'
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
      code: 'Cliente',
      href: '/crm',
      description: 'Cliente do catalogo aguardando atendimento.'
    }));

  const catalogLeads = [...catalogQuoteLeads, ...catalogCustomerLeads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadCatalogLeads = catalogLeads.filter((lead) => !readCatalogInterestIds.includes(lead.id));
  const recentCatalogLeads = unreadCatalogLeads.slice(0, 5);

  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'Visao Geral';

    const titles: Record<string, string> = {
      dashboard: 'Dashboard Executivo',
      crm: 'Clientes',
      products: 'Catalogo de Produtos',
      quotes: 'Orcamentos & Propostas',
      pricing: 'Calculadora de Precificacao',
      orders: 'Controle de Pedidos',
      production: 'Ordem de Servico & Producao',
      financial: 'Gestao Financeira & Caixa',
      stock: 'Estoque & Insumos',
      shipment: 'Expedicao & Logistica',
      resale: 'Revenda & Terceirizados',
      settings: 'Configuracoes do ERP',
      employees: 'Equipe & Funcionarios'
    };

    return titles[segments[0]] || 'PrintFlowPRO';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      gerente: 'Gerente',
      financeiro: 'Financeiro',
      producao: 'Producao',
      vendas: 'Vendas',
      estoque: 'Estoque',
      arte_finalista: 'Arte Finalista'
    };

    return labels[role] || role;
  };

  return (
    <header className="h-16 border-b border-border bg-white/85 dark:bg-card/90 px-3 sm:px-4 flex items-center justify-between gap-2 sticky top-0 z-30 shadow-sm backdrop-blur no-print">
      <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex items-center justify-center p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary border border-border mr-1 transition-all"
          title={sidebarOpen ? 'Recolher Menu' : 'Expandir Menu'}
        >
          {sidebarOpen ? <ChevronLeft className="h-4.5 w-4.5" /> : <ChevronRight className="h-4.5 w-4.5" />}
        </button>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary md:hidden"
          title="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <h1 className="font-semibold text-base md:text-lg text-foreground md:tracking-wide truncate">
            {getPageTitle()}
          </h1>
          <p className="hidden md:block text-[11px] text-muted-foreground truncate">
            {company.name} - {company.document}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground border border-border"
          title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={`relative p-2 rounded-lg border transition-all ${
              unreadCatalogLeads.length > 0
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/15'
                : 'hover:bg-secondary text-muted-foreground hover:text-foreground border-border'
            }`}
            title="Interesses do catalogo"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadCatalogLeads.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                {unreadCatalogLeads.length > 9 ? '9+' : unreadCatalogLeads.length}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-card border border-border shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-foreground">Interesses do catalogo</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-black">
                      {unreadCatalogLeads.length}
                    </span>
                  </div>
                </div>

                {recentCatalogLeads.length > 0 ? (
                  <div className="max-h-80 overflow-auto p-1">
                    {recentCatalogLeads.map((lead) => (
                      <Link
                        key={lead.id}
                        href={lead.href}
                        onClick={() => {
                          markCatalogInterestAsRead(lead.id);
                          setNotificationsOpen(false);
                        }}
                        className="flex gap-3 px-3 py-3 rounded-lg hover:bg-secondary transition-all"
                      >
                        <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                          <FileText className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground truncate">{lead.customerName}</span>
                            <span className="text-[10px] font-black text-primary">{lead.code}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 truncate">
                            {lead.description}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhum interesse novo no momento.
                  </div>
                )}

                <Link
                  href={catalogQuoteLeads.length > 0 ? '/quotes' : '/crm'}
                  onClick={() => setNotificationsOpen(false)}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-border text-xs font-bold text-primary hover:bg-secondary transition-all"
                >
                  Abrir orçamentos <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:pl-2.5 sm:pr-2 rounded-lg hover:bg-secondary border border-border text-sm font-medium text-foreground transition-all"
          >
            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              {activeProfile.name.charAt(0)}
            </div>
            <div className="hidden md:flex flex-col items-start text-left leading-none">
              <span className="text-xs font-semibold">{activeProfile.name}</span>
              <span className="text-[10px] text-muted-foreground">{getRoleLabel(activeProfile.role)}</span>
            </div>
            <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-muted-foreground ml-1" />
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-60 rounded-xl bg-card border border-border shadow-lg p-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                  Sessao autenticada
                </div>
                <div className="px-2.5 py-2 text-xs">
                  <div className="font-semibold text-foreground">{activeProfile.name}</div>
                  <div className="text-[10px] text-muted-foreground break-all">{activeProfile.email}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase text-primary">{getRoleLabel(activeProfile.role)}</div>
                </div>
                <button
                  onClick={async () => {
                    setActiveProfile(activeProfile);
                    setProfileDropdownOpen(false);
                    await logout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg text-left transition-all text-rose-500 hover:bg-rose-500/10 font-semibold"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair da conta
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
