'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDatabase } from '@/context/database-context';
import { UserProfile } from '@/lib/dummy-data';

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
  const { company } = useDatabase();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'Visao Geral';

    const titles: Record<string, string> = {
      dashboard: 'Dashboard Executivo',
      crm: 'CRM - Gestao de Clientes',
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
    <header className="h-16 border-b border-border bg-white/85 dark:bg-card/90 px-4 flex items-center justify-between sticky top-0 z-30 shadow-sm backdrop-blur no-print">
      <div className="flex items-center gap-3 min-w-0">
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

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground border border-border"
          title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 p-1.5 pl-2.5 pr-2 rounded-lg hover:bg-secondary border border-border text-sm font-medium text-foreground transition-all"
          >
            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              {activeProfile.name.charAt(0)}
            </div>
            <div className="hidden md:flex flex-col items-start text-left leading-none">
              <span className="text-xs font-semibold">{activeProfile.name}</span>
              <span className="text-[10px] text-muted-foreground">{getRoleLabel(activeProfile.role)}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1" />
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
