'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/dashboard/sidebar';
import Header from '@/components/dashboard/header';
import MobileBottomNav from '@/components/dashboard/mobile-bottom-nav';
import {BillingBoundary} from '@/components/billing/billing-boundary';
import Image from 'next/image';
import styles from './login.module.css';
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
  UserPlus
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  producao: 'Produção',
  vendas: 'Vendas',
  estoque: 'Estoque',
  arte_finalista: 'Arte Finalista'
};

function resolvePermissionSegment(pathname: string) {
  if (pathname.startsWith('/pdf-preview/order/')) return '/orders';
  if (pathname.startsWith('/pdf-preview/quote/')) return '/quotes';
  if (pathname.startsWith('/catalog')) return '/settings';

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
    isAuthenticated,
    isLoading,
    authError,
    signIn,
    signUp
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
        />

        <main className="flex-1 w-full max-w-7xl min-w-0 mx-auto animate-in fade-in duration-300 flex flex-col overflow-x-hidden px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:px-4 md:p-6">
          {hasAccess ? (
            <BillingBoundary key={activeProfile.company_id} companyId={activeProfile.company_id || ''}>{children}</BillingBoundary>
          ) : (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="max-w-md w-full bg-card border border-border p-8 rounded-3xl text-center space-y-6 shadow-2xl relative overflow-hidden">
                <div className="relative mx-auto h-20 w-20 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20 shadow-lg shadow-rose-500/5 animate-pulse">
                  <Lock className="h-9 w-9 stroke-[1.5]" />
                  <ShieldAlert className="h-4.5 w-4.5 absolute bottom-1 right-1 text-rose-500 bg-card rounded-full" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-black uppercase tracking-wider text-foreground">Acesso não autorizado</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Seu perfil não possui permissão para acessar este módulo.
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
        setSuccessMessage('Conta criada. Confira seu e-mail para verificar se há uma confirmação pendente antes de entrar.');
      } else {
        await onSignIn(email, password);
      }
    } catch {
      setLocalError(mode === 'signup' ? 'Não foi possível criar a conta agora.' : 'E-mail ou senha inválidos, ou perfil sem permissão ativa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <aside className={styles.presentation}>
        <a href="https://printflowpro-vendas.vercel.app/" aria-label="Página inicial do PrintFlowPro"><Image src="/brands/printflowpro-white.png" width={1009} height={202} alt="PrintFlowPro" className={styles.logo} priority /></a>
        <div className={styles.message}>
          <span className={styles.eyebrow}>SUA GRÁFICA, NO MESMO FLUXO</span>
          <h2>Boas ideias.<br />Uma rotina<br /><span>mais organizada.</span></h2>
          <p>Do primeiro orçamento ao pedido aprovado, dê continuidade ao que faz o seu negócio acontecer.</p>
          <div className={styles.flow}><span>Catálogo</span><ArrowRight size={14} /><span>Orçamentos</span><ArrowRight size={14} /><span>Pedidos</span></div>
        </div>
        <p className={styles.credit}>PrintFlowPro · Um projeto da Vextro Tecnologia.</p>
      </aside>
      <section className={styles.access} aria-label="Acesso ao PrintFlowPro">
        <a href="https://printflowpro-vendas.vercel.app/" className={styles.back}>← Voltar ao site</a>
        <div className={styles.formWrap}>
        <Image src="/brands/printflowpro-blue.png" width={1009} height={202} alt="PrintFlowPro" className={styles.mobileLogo} priority />
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.formHeading}>
            <span className={styles.eyebrow}>BEM-VINDO AO PRINTFLOWPRO</span>
            <h1>{mode === 'login' ? 'Seu próximo passo começa aqui.' : 'Vamos começar?'}</h1>
            <p>{mode === 'login' ? 'Entre na sua conta para continuar.' : 'Preencha os dados para criar o acesso da sua empresa.'}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              aria-pressed={mode === 'login'}
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
              aria-pressed={mode === 'signup'}
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
            <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
              {localError || authError}
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs leading-5 text-teal-700">
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
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
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
            Sua operação protegida para você trabalhar com segurança e tranquilidade.
          </p>
        </form>
        </div>
      </section>
    </div>
  );
}
