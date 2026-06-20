'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Home, LogOut, MapPin, Package, ShieldCheck, UserRound } from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { useStoreCustomer } from '@/context/store-customer-context';

const navItems = [
  { href: '/store/conta', label: 'Minha conta', icon: Home },
  { href: '/store/conta/perfil', label: 'Meus dados', icon: UserRound },
  { href: '/store/conta/enderecos', label: 'Enderecos', icon: MapPin },
  { href: '/store/conta/pedidos', label: 'Pedidos', icon: Package }
];

export function StoreAccountShell({
  title,
  subtitle,
  children,
  requireAuth = true
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  requireAuth?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { company } = useDatabase();
  const { isAuthenticated, isLoading, signOut } = useStoreCustomer();
  const primaryColor = company.theme_color || '#5b3df4';

  useEffect(() => {
    if (!requireAuth || isLoading || isAuthenticated) return;
    const redirect = encodeURIComponent(pathname || '/store/conta');
    router.replace(`/store/login?redirect=${redirect}`);
  }, [isAuthenticated, isLoading, pathname, requireAuth, router]);

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

  if (requireAuth && !isAuthenticated) return null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-slate-900 md:pb-0">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link href="/store" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: primaryColor }}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{company.name || 'Loja online'}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Area do cliente</p>
            </div>
          </Link>

          <Link href="/store" className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 md:flex">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao catalogo
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:px-8">
        {requireAuth && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <nav className="grid grid-cols-2 gap-1 md:grid-cols-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black transition ${
                      active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    style={active ? { backgroundColor: primaryColor } : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => signOut()}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-xs font-black text-rose-500 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sair
              </button>
            </nav>
          </aside>
        )}

        <section className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
            {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
          </div>
          {children}
        </section>
      </main>
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
