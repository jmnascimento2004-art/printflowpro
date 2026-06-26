'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserPlus
} from 'lucide-react';
import { StoreFooter } from '@/components/store/StoreFooter';
import { StoreField } from '@/components/store/StoreFormFields';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import type { Company } from '@/lib/dummy-data';
import { StoreCustomerType, StoreSignupInput, validateStoreSignup } from '@/lib/store-customer';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/lib/privacy';
import { sanitizeStoreRedirect, STORE_ROUTES } from '@/lib/store-routes';
import { formatCNPJ, formatCPF } from '@/lib/utils';

const signupInputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100';

const checkboxClass = 'mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600';

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

function StoreSignupHeader({ company, primaryColor }: { company: Company; primaryColor: string }) {
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
          <span className="hidden sm:inline">Voltar para a loja</span>
          <span className="sm:hidden">Loja</span>
        </Link>
      </div>
    </header>
  );
}

export default function StoreSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = sanitizeStoreRedirect(params.get('redirect'));
  const { company, settings } = useDatabase();
  const { signUp } = useStoreCustomer();
  const primaryColor = normalizePrimaryColor(company.theme_color);
  const [form, setForm] = useState<StoreSignupInput>({
    name: '',
    customerType: 'fisica',
    document: '',
    email: '',
    phone: '',
    password: '',
    tradeName: '',
    birthDate: '',
    contactPreference: 'whatsapp',
    privacyAccepted: false,
    termsAccepted: false,
    marketingEmailAccepted: false,
    marketingWhatsappAccepted: false
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setValue = <K extends keyof StoreSignupInput>(key: K, value: StoreSignupInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleDocument = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, form.customerType === 'fisica' ? 11 : 14);
    setValue('document', form.customerType === 'fisica' ? formatCPF(clean) : formatCNPJ(clean));
  };

  const handleTypeChange = (nextType: StoreCustomerType) => {
    setForm((current) => ({ ...current, customerType: nextType, document: '' }));
  };

  const createSignupSuccessUrl = () => {
    const successParams = new URLSearchParams();
    if (form.email.trim()) successParams.set('email', form.email.trim().toLowerCase());
    if (redirect) successParams.set('redirect', redirect);
    const query = successParams.toString();
    return query ? `${STORE_ROUTES.signupSuccess}?${query}` : STORE_ROUTES.signupSuccess;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const validation = validateStoreSignup(form);
    if (validation) {
      setError(validation);
      return;
    }

    if (form.password !== confirmPassword) {
      setError('A confirmacao de senha precisa ser igual a senha informada.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp(form);
      if (result === 'confirmed') {
        router.push(redirect || STORE_ROUTES.account);
      } else {
        router.replace(createSignupSuccessUrl());
      }
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Nao foi possivel criar sua conta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <StoreSignupHeader company={company} primaryColor={primaryColor} />

      <main className="px-4 py-8 md:px-8 md:py-12">
        <div className="mx-auto grid max-w-6xl items-start justify-center gap-6 lg:grid-cols-[minmax(0,580px)_340px]">
          <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Area do Cliente</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Cadastre-se</h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Preencha os campos abaixo para criar sua conta</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">{error}</div>}

              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {(['fisica', 'juridica'] as StoreCustomerType[]).map((type) => {
                  const active = form.customerType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`h-11 rounded-lg text-xs font-black transition ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
                      style={active ? { backgroundColor: primaryColor } : undefined}
                    >
                      {type === 'fisica' ? 'Pessoa Fisica' : 'Pessoa Juridica'}
                    </button>
                  );
                })}
              </div>

              <StoreField label={form.customerType === 'fisica' ? 'Nome completo' : 'Razao social'}>
                <input
                  className={signupInputClass}
                  value={form.name}
                  onChange={(event) => setValue('name', event.target.value)}
                  placeholder={form.customerType === 'fisica' ? 'Seu nome completo' : 'Razao social da empresa'}
                  required
                />
              </StoreField>

              {form.customerType === 'juridica' && (
                <StoreField label="Nome fantasia">
                  <input
                    className={signupInputClass}
                    value={form.tradeName}
                    onChange={(event) => setValue('tradeName', event.target.value)}
                    placeholder="Nome comercial"
                  />
                </StoreField>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StoreField label={form.customerType === 'fisica' ? 'CPF' : 'CNPJ'}>
                  <input
                    className={signupInputClass}
                    value={form.document}
                    onChange={(event) => handleDocument(event.target.value)}
                    placeholder={form.customerType === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'}
                    required
                  />
                </StoreField>
                <StoreField label="Telefone / WhatsApp">
                  <input
                    className={signupInputClass}
                    value={form.phone}
                    onChange={(event) => setValue('phone', event.target.value)}
                    placeholder="(00) 00000-0000"
                    required
                  />
                </StoreField>
              </div>

              <StoreField label="E-mail">
                <input
                  className={signupInputClass}
                  type="email"
                  value={form.email}
                  onChange={(event) => setValue('email', event.target.value)}
                  placeholder="seuemail@exemplo.com"
                  required
                />
              </StoreField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StoreField label="Senha">
                  <input
                    className={signupInputClass}
                    type="password"
                    value={form.password}
                    onChange={(event) => setValue('password', event.target.value)}
                    placeholder="Crie uma senha"
                    required
                  />
                </StoreField>
                <StoreField label="Confirmar senha">
                  <input
                    className={signupInputClass}
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a senha"
                    required
                  />
                </StoreField>
              </div>

              <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                <input type="checkbox" checked={form.privacyAccepted} onChange={(event) => setValue('privacyAccepted', event.target.checked)} className={checkboxClass} />
                <span>
                  Li e aceito a <Link href={STORE_ROUTES.publicPrivacy} className="font-black text-slate-950 underline-offset-4 hover:underline">Politica de Privacidade</Link> para cadastro,
                  pedidos, entrega e atendimento. Versao {PRIVACY_POLICY_VERSION}.
                </span>
              </label>

              <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                <input type="checkbox" checked={form.termsAccepted} onChange={(event) => setValue('termsAccepted', event.target.checked)} className={checkboxClass} />
                <span>
                  Li e aceito os <Link href="/store/termos" className="font-black text-slate-950 underline-offset-4 hover:underline">Termos de Uso</Link> do catalogo online.
                  Versao {TERMS_VERSION}.
                </span>
              </label>

              <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                <input type="checkbox" checked={form.marketingEmailAccepted} onChange={(event) => setValue('marketingEmailAccepted', event.target.checked)} className={checkboxClass} />
                Quero receber ofertas e campanhas por e-mail. Opcional, sem bloquear cadastro ou compra.
              </label>

              <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                <input type="checkbox" checked={form.marketingWhatsappAccepted} onChange={(event) => setValue('marketingWhatsappAccepted', event.target.checked)} className={checkboxClass} />
                Quero receber ofertas e campanhas por WhatsApp. Opcional e revogavel.
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-black text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                <UserPlus className="h-4 w-4" />
                {submitting ? 'Criando conta...' : 'Criar minha conta'}
              </button>

              <p className="text-center text-xs font-bold text-slate-500">
                Ja tem conta? <Link href={STORE_ROUTES.login} className="text-slate-950 underline-offset-4 hover:underline">Entrar</Link>
              </p>
            </form>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: primaryColor }}>
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-black leading-tight text-slate-950">Crie sua conta para comprar com mais facilidade</h2>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
              Crie sua conta para acompanhar seus pedidos, salvar seus dados e comprar com mais facilidade.
            </p>
            <div className="mt-5 space-y-3">
              {[
                { icon: CheckCircle2, label: 'Acompanhe seus pedidos pelo catalogo' },
                { icon: ShieldCheck, label: 'Seus dados ficam protegidos para proximas compras' },
                { icon: Truck, label: 'Enderecos salvos agilizam novos pedidos' },
                { icon: CreditCard, label: 'Orcamentos e compras em um fluxo mais rapido' }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: primaryColor }} />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </main>

      <StoreFooter company={company} settings={settings} />
    </div>
  );
}
