'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  LogIn,
  Mail,
  Phone
} from 'lucide-react';
import { StoreField } from '@/components/store/StoreFormFields';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import type { Company, Settings } from '@/lib/dummy-data';
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

const onlyDigits = (value?: string) => (value || '').replace(/\D/g, '');

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

function getWhatsAppHref(phone?: string) {
  const digits = onlyDigits(phone);
  if (!digits) return STORE_ROUTES.home;
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
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
            <p className="truncate text-sm font-black text-slate-950">{storeName}</p>
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

function FooterBadge({ label, image }: { label: string; image?: string }) {
  if (image) {
    return <img src={image} alt={label} title={label} className="h-8 w-auto rounded bg-white object-contain shadow-sm" />;
  }

  return (
    <span className="rounded-lg border border-slate-700/40 bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
      {label}
    </span>
  );
}

function StoreLoginFooter({ company, settings, primaryColor }: { company: Company; settings: Settings; primaryColor: string }) {
  const phone = company.phone || settings.catalog_whatsapp || settings.top_bar_phone || '';
  const email = company.email || 'contato@printflowpro.com.br';
  const whatsappHref = getWhatsAppHref(phone);
  const showAddress = settings.footer_show_address !== false;
  const hasAddress = Boolean(company.street || company.city || company.state || company.cep);
  const paymentBadges = [
    { label: 'Visa', visible: company.show_payments_visa !== false, image: company.img_payments_visa },
    { label: 'Mastercard', visible: company.show_payments_mastercard !== false, image: company.img_payments_mastercard },
    { label: 'Elo', visible: company.show_payments_elo !== false, image: company.img_payments_elo },
    { label: 'Hipercard', visible: company.show_payments_hipercard !== false, image: company.img_payments_hipercard },
    { label: 'PIX', visible: company.show_payments_pix !== false, image: company.img_payments_pix }
  ];
  const deliveryBadges = [
    { label: 'SEDEX', visible: company.show_delivery_sedex !== false, image: company.img_delivery_sedex },
    { label: 'Correios', visible: company.show_delivery_correios !== false, image: company.img_delivery_correios },
    { label: 'Jadlog', visible: company.show_delivery_jadlog !== false, image: company.img_delivery_jadlog },
    { label: 'Motoboy', visible: company.show_delivery_motoboy !== false, image: company.img_delivery_motoboy }
  ];
  const securityBadges = [
    { label: 'SSL Seguro', visible: company.show_security_letsencrypt !== false, image: company.img_security_letsencrypt },
    { label: 'Google Safe', visible: company.show_security_google !== false, image: company.img_security_google }
  ];

  return (
    <footer className="border-t border-slate-800 bg-slate-900 py-8 text-xs text-slate-400">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4 md:px-8">
        <div className="space-y-4">
          <h4 className="border-b border-slate-800/80 pb-2 text-sm font-extrabold uppercase tracking-wider text-white">Contatos</h4>
          <div className="space-y-3.5">
            <div>
              <span className="block text-[9px] font-extrabold uppercase tracking-widest text-slate-500">WhatsApp vendas</span>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-2 font-semibold text-slate-200 transition hover:text-emerald-400">
                <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{phone || 'Atendimento online'}</span>
              </a>
            </div>
            <div>
              <span className="block text-[9px] font-extrabold uppercase tracking-widest text-slate-500">E-mail vendas</span>
              <a href={`mailto:${email}`} className="mt-1 flex items-center gap-2 break-all font-semibold text-slate-200 transition hover:text-emerald-400">
                <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{email}</span>
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="border-b border-slate-800/80 pb-2 text-sm font-extrabold uppercase tracking-wider text-white">Endereco</h4>
          <div className="space-y-1.5">
            <span className="block text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Sede / Matriz</span>
            {showAddress && hasAddress ? (
              <p className="font-medium leading-relaxed text-slate-200">
                {company.street ? `${company.street}, ${company.number || 's/n'}` : 'Endereco comercial'}
                <br />
                {[company.neighborhood, company.city && company.state ? `${company.city}/${company.state}` : company.city || company.state].filter(Boolean).join(' - ')}
                {company.cep ? <><br />CEP {company.cep}</> : null}
              </p>
            ) : (
              <p className="font-medium leading-relaxed text-slate-200">Atendimento pelo catalogo online</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="border-b border-slate-800/80 pb-2 text-sm font-extrabold uppercase tracking-wider text-white">Horario de Atendimento</h4>
          <div className="space-y-3 font-medium leading-relaxed text-slate-200">
            {settings.footer_hours_message && (
              <p className="rounded-lg border border-slate-800 bg-slate-800/40 p-2 text-[10px] italic text-slate-400">{settings.footer_hours_message}</p>
            )}
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{settings.footer_hours_week || '8h as 12h / 13h30 as 18h'}</span>
              </p>
              <p className="pl-5 text-[10px] font-bold uppercase text-slate-400">{settings.footer_hours_sat || 'Segunda a Sexta-feira'}</p>
            </div>
            {settings.footer_hours_sat_time && (
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>{settings.footer_hours_sat_time}</span>
                </p>
                <p className="pl-5 text-[10px] font-bold uppercase text-slate-400">{settings.footer_hours_sat_desc || 'Sabado'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="border-b border-slate-800/80 pb-2 text-sm font-extrabold uppercase tracking-wider text-white">Institucional</h4>
          <div className="flex flex-col gap-2.5 font-semibold">
            <Link href={STORE_ROUTES.home} className="text-slate-300 transition hover:text-emerald-400">Todos os servicos</Link>
            <Link href={STORE_ROUTES.login} className="text-slate-300 transition hover:text-emerald-400">Entrar</Link>
            <Link href={STORE_ROUTES.account} className="text-slate-300 transition hover:text-emerald-400">Minha conta</Link>
            <Link href={STORE_ROUTES.orders} className="text-slate-300 transition hover:text-emerald-400">Meus pedidos</Link>
            <Link href={STORE_ROUTES.publicPrivacy} className="text-slate-300 transition hover:text-emerald-400">Politica de Privacidade</Link>
            <Link href="/store/cookies" className="text-slate-300 transition hover:text-emerald-400">Politica de Cookies</Link>
            <Link href="/store/termos" className="text-slate-300 transition hover:text-emerald-400">Termos de Uso</Link>
            <Link href="/store/privacidade/solicitar" className="text-slate-300 transition hover:text-emerald-400">Solicitacoes de Privacidade</Link>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="text-slate-300 transition hover:text-emerald-400">Atendimento</a>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-7xl grid-cols-1 gap-8 border-t border-slate-800/80 px-4 pt-8 sm:grid-cols-2 lg:grid-cols-4 md:px-8">
        <div className="space-y-3 lg:col-span-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: primaryColor }}>Formas de pagamento</h4>
          <div className="flex flex-wrap gap-2">
            {paymentBadges.filter((badge) => badge.visible).map((badge) => <FooterBadge key={badge.label} label={badge.label} image={badge.image} />)}
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: primaryColor }}>Formas de entrega</h4>
          <div className="flex flex-wrap gap-2">
            {deliveryBadges.filter((badge) => badge.visible).map((badge) => <FooterBadge key={badge.label} label={badge.label} image={badge.image} />)}
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: primaryColor }}>Seguranca</h4>
          <div className="flex flex-wrap gap-2">
            {securityBadges.filter((badge) => badge.visible).map((badge) => <FooterBadge key={badge.label} label={badge.label} image={badge.image} />)}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-7xl flex-col items-center gap-3 border-t border-slate-800/80 px-4 pt-6 text-center text-[10px] font-medium text-slate-500 md:px-8">
        <p>
          {new Date().getFullYear()} - Copyright © - {company.name || 'CibelePRINT'}
          {company.document ? ` - CNPJ: ${company.document}` : ''}.
        </p>
      </div>
    </footer>
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
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Entrar na sua conta</h1>
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

      <StoreLoginFooter company={company} settings={settings} primaryColor={primaryColor} />
    </div>
  );
}
