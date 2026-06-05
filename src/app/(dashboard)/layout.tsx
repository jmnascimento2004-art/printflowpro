'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/dashboard/sidebar';
import Header from '@/components/dashboard/header';
import { useAuth } from '@/context/auth-context';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, ShieldAlert, ChevronRight } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  producao: 'Produção',
  vendas: 'Vendas',
  estoque: 'Estoque',
  arte_finalista: 'Arte Finalista (Designer)'
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { activeProfile, setActiveProfile } = useAuth();
  const { rolePermissions } = useDatabase();
  const pathname = usePathname();
  const router = useRouter();

  const currentBaseSegment = '/' + pathname.split('/').filter(Boolean)[0];
  const allowedRoles = rolePermissions[currentBaseSegment] || DEFAULT_ROLE_PERMISSIONS[currentBaseSegment] || [];
  const hasAccess = allowedRoles.includes(activeProfile.role);

  return (
    <div className="min-h-screen bg-background text-foreground flex text-slate-800 dark:text-slate-100">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Main content container */}
      <div 
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${
          sidebarOpen ? 'md:pl-64' : 'md:pl-16'
        }`}
      >
        {/* Header */}
        <Header 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          activeProfile={activeProfile}
          setActiveProfile={setActiveProfile}
        />

        {/* Dynamic page contents */}
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto min-w-0 animate-in fade-in duration-300 flex flex-col">
          {hasAccess ? (
            children
          ) : (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="max-w-md w-full bg-card border border-border p-8 rounded-3xl text-center space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative mx-auto h-20 w-20 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20 shadow-lg shadow-rose-500/5 animate-pulse">
                  <Lock className="h-9 w-9 stroke-[1.5]" />
                  <ShieldAlert className="h-4.5 w-4.5 absolute bottom-1 right-1 text-rose-500 bg-card rounded-full" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-lg font-black uppercase tracking-wider text-foreground">Acesso Não Autorizado</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Você não possui as permissões necessárias para acessar este módulo. Esta tela está restrita por regras do sistema.
                  </p>
                </div>

                <div className="p-4 bg-secondary/30 border border-border rounded-2xl text-[11px] text-left space-y-2 font-medium">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground uppercase text-[10px] font-bold">Seu Cargo Atual:</span>
                    <span className="text-rose-500 dark:text-rose-400 font-extrabold uppercase">{ROLE_LABELS[activeProfile.role] || activeProfile.role}</span>
                  </div>
                  <div className="flex flex-col gap-1 pt-1.5 border-t border-border">
                    <span className="text-muted-foreground uppercase text-[10px] font-bold">Cargos com Acesso:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {allowedRoles?.map((r) => (
                        <span key={r} className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/10 text-[9px] font-bold uppercase">
                          {ROLE_LABELS[r] || r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold transition-all shadow-md shadow-primary/10 hover:shadow-lg flex items-center justify-center gap-1.5"
                >
                  Ir para Painel de Controle <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
