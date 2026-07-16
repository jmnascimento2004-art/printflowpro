'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Bell, ChevronLeft, ChevronRight, FileText, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDatabase } from '@/context/database-context';
import { UserProfile } from '@/lib/dummy-data';

const CATALOG_INTERESTS_READ_KEY = 'printflow_catalog_interests_read_ids';
const CATALOG_INTERESTS_READ_EVENT = 'printflow_catalog_interests_read_change';
const ROLE_LABELS: Record<UserProfile['role'], string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  producao: 'Produção',
  vendas: 'Vendas',
  estoque: 'Estoque',
  arte_finalista: 'Arte Finalista'
};

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  activeProfile
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeProfile: UserProfile;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { company, customers, quotes } = useDatabase();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readCatalogInterestIds, setReadCatalogInterestIds] = useState<string[]>([]);
  const companyDisplayName = (() => {
    const name = company.name?.trim();
    const slug = name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    return name && slug !== 'printflowpro' && slug !== 'minhaempresa' ? name : 'CibelePRINT';
  })();

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

  const quotedCatalogCustomerIds = new Set(
    quotes
      .filter((quote) => {
        const customer = customers.find((item) => item.id === quote.customer_id);
        return (
          quote.customer_id.startsWith('cust-web-') ||
          quote.customer_name.includes('(Web)') ||
          customer?.tags?.includes('Catalogo Online') ||
          customer?.tags?.includes('Catalogo')
        );
      })
      .map((quote) => quote.customer_id)
  );

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
    if (segments.length === 0) return 'Visão Geral';

    const titles: Record<string, string> = {
      dashboard: 'Dashboard Executivo',
      crm: 'Clientes',
      products: 'Catálogo de Produtos',
      quotes: 'Orçamentos & Propostas',
      pricing: 'Calculadora de Precificação',
      orders: 'Controle de Pedidos',
      production: 'Ordem de Serviço & Produção',
      financial: 'Gestão Financeira & Caixa',
      stock: 'Estoque & Insumos',
      shipment: 'Expedição & Logística',
      resale: 'Revenda & Terceirizados',
      settings: 'Configurações do ERP',
      employees: 'Equipe & Funcionários'
    };

    return titles[segments[0]] || companyDisplayName;
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

        <div className="min-w-0">
          <h1 className="font-semibold text-base md:text-lg text-foreground md:tracking-wide truncate">
            {getPageTitle()}
          </h1>
          <p className="hidden md:block text-[11px] text-muted-foreground truncate">
            {companyDisplayName} - {company.document}
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

        <div className="flex min-w-0 items-center gap-2" title={activeProfile.name}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-xs font-bold text-primary shadow-sm">
            {activeProfile.avatar_url ? (
              <Image
                src={activeProfile.avatar_url}
                alt={`Foto de ${activeProfile.name}`}
                width={40}
                height={40}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-label={`Avatar de ${activeProfile.name}`}>
                {activeProfile.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex min-w-0 max-w-28 flex-col text-left leading-tight sm:max-w-40">
            <span className="truncate text-xs font-semibold text-foreground">{activeProfile.name}</span>
            <span className="truncate text-[10px] text-muted-foreground">{ROLE_LABELS[activeProfile.role]}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
