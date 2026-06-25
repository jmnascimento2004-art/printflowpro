'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Home, LockKeyhole, LogOut, MapPin, Package, ShieldCheck, UserRound } from 'lucide-react';
import { StoreFooter } from '@/components/store/StoreFooter';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';
import { STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

const navItems = [
  { href: STORE_ROUTES.account, label: 'Minha conta', icon: Home },
  { href: STORE_ROUTES.orders, label: 'Meus pedidos', icon: Package },
  { href: STORE_ROUTES.addresses, label: 'Enderecos', icon: MapPin },
  { href: STORE_ROUTES.profile, label: 'Dados cadastrais', icon: UserRound },
  { href: STORE_ROUTES.security, label: 'Seguranca e senha', icon: LockKeyhole },
  { href: STORE_ROUTES.privacy, label: 'Privacidade', icon: ShieldCheck }
];

const normalizeAccountColor = (color?: string) => {
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

export function StoreAccountShell({
  title,
  subtitle,
  children,
  requireAuth = true,
  hidePageHeader = false
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  requireAuth?: boolean;
  hidePageHeader?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { company, settings } = useDatabase();
  const { session, isAuthenticated, isLoading, signOut, customer, error, refresh } = useStoreCustomer();
  const hasStoreSession = Boolean(session?.user);
  const primaryColor = normalizeAccountColor(company.theme_color);
  const logoSrc = company.logo_light || company.logo_dark || company.logo_url;
  const storeName = company.name || 'Loja online';

  useEffect(() => {
    if (!requireAuth || isLoading || isAuthenticated || hasStoreSession) return;
    router.replace(withStoreRedirect(STORE_ROUTES.login, pathname || STORE_ROUTES.account));
  }, [hasStoreSession, isAuthenticated, isLoading, pathname, requireAuth, router]);

  if (requireAuth && isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          <p className="mt-4 text-sm font-bold text-slate-500">Carregando sua area...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated && !hasStoreSession) return null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-900 md:pb-0">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link href={STORE_ROUTES.home} className="flex min-w-0 items-center gap-3">
            {logoSrc ? (
              <img src={logoSrc} alt={storeName} className="h-11 max-w-44 shrink-0 object-contain" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>
                {storeName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{storeName}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Area do cliente</p>
            </div>
          </Link>

          <Link href={STORE_ROUTES.home} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao catalogo</span>
            <span className="sm:hidden">Catalogo</span>
          </Link>
        </div>
      </header>

      <main className={`mx-auto grid max-w-7xl gap-4 px-4 py-4 md:px-8 md:py-5 ${requireAuth ? 'md:grid-cols-[230px_minmax(0,1fr)]' : ''}`}>
        {requireAuth && (
          <aside className="space-y-2">
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Cliente</p>
              <p className="mt-0.5 truncate text-sm font-black text-slate-950">{customer?.name || 'Minha conta'}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{customer?.email || 'Dados do catalogo'}</p>
            </div>

            <nav className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white/90 p-1.5 md:grid-cols-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-black transition ${
                      active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                    style={active ? { backgroundColor: primaryColor } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => signOut()}
                className="mt-1 flex min-h-9 items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/70 px-2.5 text-left text-xs font-black text-rose-600 hover:bg-rose-50 md:mt-2"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                Sair
              </button>
            </nav>
          </aside>
        )}

        <section className="min-w-0 space-y-3">
          {!hidePageHeader && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Inicio / {title}
              </p>
              <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
            </div>
          )}
          {requireAuth && hasStoreSession && !isAuthenticated && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 shadow-sm">
              Sua sessao foi iniciada. Estamos finalizando o vinculo com seus dados do catalogo.
              {error && <span className="block pt-1 text-xs font-semibold">{error}</span>}
              <button type="button" onClick={() => refresh()} className="mt-2 text-xs font-black underline underline-offset-4">
                Tentar carregar novamente
              </button>
            </div>
          )}
          {children}
        </section>
      </main>

      <StoreFooter company={company} settings={settings} />
    </div>
  );
}

export function StoreAuthPanel({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <StoreAccountShell title={title} subtitle={subtitle} requireAuth={false}>
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {children}
      </div>
    </StoreAccountShell>
  );
}
