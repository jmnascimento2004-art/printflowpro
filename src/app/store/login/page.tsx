'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  LogIn
} from 'lucide-react';
import { StoreFooter } from '@/components/store/StoreFooter';
import { StoreField } from '@/components/store/StoreFormFields';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import type { Company } from '@/lib/dummy-data';
import { sanitizeStoreRedirect, STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

const loginInputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100';

const checkboxClass = 'h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600';

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

function getStoreInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);

  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || 'LO').toUpperCase();
}

function getLogoSrc(company: Company) {
  return company.logo_light || company.logo_url || company.logo_dark || '';
}

function StoreLoginHeader({ company, primaryColor }: { company: Company; primaryColor: string }) {
  const logoSrc = getLogoSrc(company);
  const storeName = company.name || 'CibelePRINT';

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link href={STORE_ROUTES.home} className="flex min-w-0 items-center gap-3">
          {logoSrc ? (
            <img src={logoSrc} alt={storeName} className="h-12 max-w-[190px] shrink-0 object-contain" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>
              {getStoreInitials(storeName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Area do Cliente</p>
          </div>
        </Link>

        <Link
          href={STORE_ROUTES.home}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Voltar para o Catalogo</span>
          <span className="sm:hidden">Catalogo</span>
        </Link>
      </div>
    </header>
  );
}

export default function StoreLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { company, settings } = useDatabase();
  const { signIn } = useStoreCustomer();
  const redirect = sanitizeStoreRedirect(params.get('redirect'));
  const primaryColor = normalizePrimaryColor(company.theme_color);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberAccess, setRememberAccess] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await signIn(email, password);
      router.push(redirect || STORE_ROUTES.account);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Nao foi possivel entrar. Confira e-mail e senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <StoreLoginHeader company={company} primaryColor={primaryColor} />

      <main className="px-4 py-8 md:px-8 md:py-12">
        <section className="mx-auto w-full max-w-[580px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 text-center sm:text-left">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Area do Cliente</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Entrar na sua conta</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
              Acompanhe pedidos, pagamentos e aprovacoes de arte em um so lugar.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

            <StoreField label="E-mail">
              <input
                className={loginInputClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seuemail@exemplo.com"
                required
              />
            </StoreField>

            <StoreField label="Senha">
              <input
                className={loginInputClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
              />
            </StoreField>

            <div className="flex flex-col gap-3 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberAccess}
                  onChange={(event) => setRememberAccess(event.target.checked)}
                  className={checkboxClass}
                />
                Lembrar acesso
              </label>
              <Link href={STORE_ROUTES.resetPassword} className="text-slate-600 underline-offset-4 transition hover:text-slate-950 hover:underline">
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-black text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              <LogIn className="h-4 w-4" />
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>

            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Novo por aqui?</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm font-bold text-slate-600">Ainda nao possui cadastro?</p>
              <Link
                href={withStoreRedirect(STORE_ROUTES.signup, redirect)}
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Criar minha conta
              </Link>
            </div>
          </form>

          <div className="mt-6 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
            {[
              'Acompanhe seus pedidos',
              'Consulte pagamentos',
              'Aprove artes online',
              'Historico completo de compras'
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: primaryColor }} />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <StoreFooter company={company} settings={settings} />
    </div>
  );
}
