'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Menu, User, ChevronDown, Check, ChevronLeft, ChevronRight, Download, Share, X } from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDatabase } from '@/context/database-context';
import { UserProfile } from '@/lib/dummy-data';
import { usePWA } from '@/hooks/use-pwa';

export default function Header({ 
  sidebarOpen, 
  setSidebarOpen,
  activeProfile,
  setActiveProfile
}: { 
  sidebarOpen: boolean;
  setSidebarOpen: (o: boolean) => void;
  activeProfile: UserProfile;
  setActiveProfile: (u: UserProfile) => void;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { company, profiles } = useDatabase();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const { isInstallable, isIOS, triggerInstall } = usePWA();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Dynamic Page Title
  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'Visão Geral';
    const mainSegment = segments[0];

    const titles: Record<string, string> = {
      dashboard: 'Dashboard Executivo',
      crm: 'CRM - Gestão de Clientes',
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
      employees: 'Equipe & Funcionários',
    };

    return titles[mainSegment] || 'PrintFlowPRO';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      gerente: 'Gerente',
      financeiro: 'Financeiro',
      producao: 'Produção',
      vendas: 'Vendas',
      estoque: 'Estoque',
      arte_finalista: 'Arte Finalista (Designer)'
    };
    return labels[role] || role;
  };

  return (
    <>
      <header className="h-16 border-b border-border bg-card px-4 flex items-center justify-between sticky top-0 z-30 shadow-sm no-print">
        {/* Left side */}
        <div className="flex items-center gap-3">
          {/* Toggle Sidebar Button for Desktop */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex items-center justify-center p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground border border-border mr-1 transition-all"
            title={sidebarOpen ? "Recolher Menu" : "Expandir Menu"}
          >
            {sidebarOpen ? <ChevronLeft className="h-4.5 w-4.5" /> : <ChevronRight className="h-4.5 w-4.5" />}
          </button>

          {/* Mobile Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-semibold text-base md:text-lg text-foreground md:tracking-wide">
              {getPageTitle()}
            </h1>
            <p className="hidden md:block text-[11px] text-muted-foreground">
              {company.name} • {company.document}
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* PWA Install Button */}
          {isInstallable && (
            <button
              onClick={triggerInstall}
              className="flex items-center gap-1.5 p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:text-primary transition-all animate-pulse"
              title="Instalar ERP no Dispositivo"
            >
              <Download className="h-4.5 w-4.5" />
              <span className="hidden md:inline text-xs font-bold">Instalar App</span>
            </button>
          )}

          {/* iOS PWA Install Button */}
          {isIOS && (
            <button
              onClick={() => setShowIOSModal(true)}
              className="flex items-center gap-1.5 p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:text-primary transition-all animate-pulse"
              title="Como Instalar no iPhone/iPad"
            >
              <Download className="h-4.5 w-4.5" />
              <span className="hidden md:inline text-xs font-bold">Instalar App</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground border border-border"
            title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
          >
            {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>


        {/* User Role Switcher Dropdown */}
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
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-card border border-border shadow-lg p-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                  Simular Perfil de Usuário
                </div>
                {(profiles || []).map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setActiveProfile(profile);
                      setProfileDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg text-left transition-all ${
                      activeProfile.id === profile.id 
                        ? 'bg-primary/10 text-primary font-medium' 
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <div>
                       <div className="font-semibold">{profile.name}</div>
                      <div className="text-[10px] text-muted-foreground">{getRoleLabel(profile.role)}</div>
                    </div>
                    {activeProfile.id === profile.id && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>

      {/* iOS Install Guide Modal */}
      {showIOSModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" 
            onClick={() => setShowIOSModal(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md w-full bg-card border border-border p-6 rounded-t-3xl md:rounded-3xl shadow-2xl z-50 animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Instalar no iPhone / iPad</h3>
              <button 
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-6 space-y-4 text-xs leading-relaxed">
              <p className="text-muted-foreground text-center">
                Para instalar o **PrintFlowPRO** no seu dispositivo iOS e utilizá-lo como um aplicativo nativo em tela cheia, siga estas etapas simples:
              </p>

              <div className="space-y-3 bg-secondary/30 border border-border p-4 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Abra no Safari</span>
                    <p className="text-[11px] text-muted-foreground">Certifique-se de que está visualizando esta página no navegador Safari nativo da Apple.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      Toque no botão Compartilhar <Share className="h-3.5 w-3.5 inline text-primary" />
                    </span>
                    <p className="text-[11px] text-muted-foreground">O ícone de compartilhar é o retângulo com uma seta para cima, localizado no rodapé do Safari no iPhone ou no topo no iPad.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Selecione "Adicionar à Tela de Início"</span>
                    <p className="text-[11px] text-muted-foreground">Role a lista de ações para baixo até encontrar a opção correspondente com o ícone mais (+).</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold transition-all shadow-md shadow-primary/10"
            >
              Entendi, obrigado!
            </button>
          </div>
        </>
      )}
    </>
  );
}

