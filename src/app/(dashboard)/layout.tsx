'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/dashboard/sidebar';
import Header from '@/components/dashboard/header';
import MobileBottomNav from '@/components/dashboard/mobile-bottom-nav';
import { BrandLogo, BrandMark } from '@/components/brand';
import { useAuth } from '@/context/auth-context';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  producao: 'Producao',
  vendas: 'Vendas',
  estoque: 'Estoque',
  arte_finalista: 'Arte Finalista'
};

function resolvePermissionSegment(pathname: string) {
  if (pathname.startsWith('/pdf-preview/order/')) return '/orders';
  if (pathname.startsWith('/pdf-preview/quote/')) return '/quotes';

  return '/' + pathname.split('/').filter(Boolean)[0];
}

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const {
    activeProfile,
    setActiveProfile,
    isAuthenticated,
    isLoading,
    authError,
    signIn,
    signUp,
    logout
  } = useAuth();
  const { rolePermissions } = useDatabase();
  const pathname = usePathname();
  const router = useRouter();

  const currentBaseSegment = resolvePermissionSegment(pathname);
  const allowedRoles = rolePermissions[currentBaseSegment] || DEFAULT_ROLE_PERMISSIONS[currentBaseSegment] || [];
  const hasAccess = allowedRoles.includes(activeProfile.role);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen authError={authError} onSignIn={signIn} onSignUp={signUp} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex text-slate-900 dark:text-slate-100">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${
          sidebarOpen ? 'md:pl-64' : 'md:pl-16'
        }`}
      >
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeProfile={activeProfile}
          setActiveProfile={setActiveProfile}
          logout={logout}
        />

        <main className="flex-1 w-full max-w-7xl min-w-0 mx-auto animate-in fade-in duration-300 flex flex-col overflow-x-hidden px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:px-4 md:p-6">
          {hasAccess ? (
            children
          ) : (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="max-w-md w-full bg-card border border-border p-8 rounded-3xl text-center space-y-6 shadow-2xl relative overflow-hidden">
                <div className="relative mx-auto h-20 w-20 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20 shadow-lg shadow-rose-500/5 animate-pulse">
                  <Lock className="h-9 w-9 stroke-[1.5]" />
                  <ShieldAlert className="h-4.5 w-4.5 absolute bottom-1 right-1 text-rose-500 bg-card rounded-full" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-black uppercase tracking-wider text-foreground">Acesso nao autorizado</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Seu perfil nao possui permissao para acessar este modulo.
                  </p>
                </div>

                <div className="p-4 bg-secondary/30 border border-border rounded-2xl text-[11px] text-left space-y-2 font-medium">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground uppercase text-[10px] font-bold">Seu cargo atual:</span>
                    <span className="text-rose-500 dark:text-rose-400 font-extrabold uppercase">
                      {ROLE_LABELS[activeProfile.role] || activeProfile.role}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 pt-1.5 border-t border-border">
                    <span className="text-muted-foreground uppercase text-[10px] font-bold">Cargos com acesso:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {allowedRoles?.map((role) => (
                        <span key={role} className="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/10 text-[9px] font-bold uppercase">
                          {ROLE_LABELS[role] || role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold transition-all shadow-md shadow-primary/10 hover:shadow-lg flex items-center justify-center gap-1.5"
                >
                  Ir para painel <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function LoginScreen({
  authError,
  onSignIn,
  onSignUp
}: {
  authError: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string, companyName?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signup') {
        if (password.length < 6) {
          setLocalError('A senha precisa ter pelo menos 6 caracteres.');
          return;
        }

        await onSignUp(email, password, name, companyName);
        setSuccessMessage('Conta criada. Se o Supabase pedir confirmacao, confirme o e-mail e entre novamente.');
      } else {
        await onSignIn(email, password);
      }
    } catch {
      setLocalError(mode === 'signup' ? 'Nao foi possivel criar a conta agora.' : 'E-mail ou senha invalidos, ou perfil sem permissao ativa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/80 text-slate-900 grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden lg:flex flex-col justify-between border-r border-slate-200/80 bg-white/45 px-10 py-9 backdrop-blur">
        <BrandLogo subtitle="ERP SaaS para graficas e comunicacao visual" />

        <div className="max-w-xl space-y-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Acesso protegido com Supabase Auth
            </div>
            <h1 className="mt-5 text-2xl font-black leading-tight text-slate-950">
              Controle producao, vendas e financeiro com uma sessao segura.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              O painel administrativo exige autenticacao real. Cada conta fica vinculada a empresa pelo perfil e pelas politicas RLS do Supabase.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['RLS', 'Dados isolados por empresa'],
              ['Auth', 'Login com sessao real'],
              ['ERP', 'Operacao protegida']
            ].map(([title, text]) => (
              <div key={title} className="pf-card p-4">
                <p className="text-lg font-black text-primary">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">© 2026 PrintFlowPRO. Plataforma operacional para alta produtividade.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <form onSubmit={submit} className="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-300/30 sm:p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="lg:hidden"><BrandMark className="h-11 w-11" /></div>
              <div>
                <h1 className="text-xl font-black text-slate-950">{mode === 'login' ? 'Entrar no ERP' : 'Criar acesso'}</h1>
                <p className="text-xs text-slate-500">{mode === 'login' ? 'Use seu e-mail e senha cadastrados.' : 'Crie o primeiro acesso da empresa.'}</p>
              </div>
            </div>
            <Sparkles className="hidden h-5 w-5 text-primary sm:block" />
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`h-10 rounded-lg text-xs font-black transition ${mode === 'login' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`h-10 rounded-lg text-xs font-black transition ${mode === 'signup' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Criar conta
            </button>
          </div>

          {(localError || authError) && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
              {localError || authError}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs leading-5 text-teal-700">
              {successMessage}
            </div>
          )}

          <div className="space-y-4">
            {mode === 'signup' && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-slate-600">Seu nome</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white"
                    autoComplete="name"
                    required
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-slate-600">Nome da empresa</span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white"
                    autoComplete="organization"
                    required
                  />
                </label>
              </>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white"
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Senha</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-900"
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/95 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'signup' ? (
              <UserPlus className="h-4 w-4" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {mode === 'signup' ? 'Criar minha conta' : 'Entrar agora'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
            Ao acessar, sua sessao e validada pelo Supabase Auth e pelas regras RLS do banco.
          </p>
        </form>
      </section>
    </div>
  );
}
