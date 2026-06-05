'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/dashboard/sidebar';
import Header from '@/components/dashboard/header';
import { useAuth } from '@/context/auth-context';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, ShieldAlert, ChevronRight, Loader2, LogIn, Layers } from 'lucide-react';

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
  const { activeProfile, setActiveProfile, isAuthenticated, isLoading, authError, signIn, logout } = useAuth();
  const { rolePermissions } = useDatabase();
  const pathname = usePathname();
  const router = useRouter();

  const currentBaseSegment = '/' + pathname.split('/').filter(Boolean)[0];
  const allowedRoles = rolePermissions[currentBaseSegment] || DEFAULT_ROLE_PERMISSIONS[currentBaseSegment] || [];
  const hasAccess = allowedRoles.includes(activeProfile.role);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen authError={authError} onSignIn={signIn} />;
  }

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
          logout={logout}
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

function LoginScreen({
  authError,
  onSignIn
}: {
  authError: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);

    try {
      await onSignIn(email, password);
    } catch {
      setLocalError('E-mail ou senha inválidos, ou perfil sem permissão ativa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-slate-800 bg-slate-950 p-6 rounded-2xl shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">PrintFlowPRO</h1>
            <p className="text-xs text-slate-400">Acesso seguro ao ERP</p>
          </div>
        </div>

        {(localError || authError) && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {localError || authError}
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-300">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-primary"
            autoComplete="email"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-300">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-primary"
            autoComplete="current-password"
            required
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Entrar
        </button>
      </form>
    </div>
  );
}
