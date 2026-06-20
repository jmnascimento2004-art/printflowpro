'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LockKeyhole, LogIn, LogOut, MapPin, PackageSearch, ShieldCheck, UserRound } from 'lucide-react';
import { useStoreCustomer } from '@/context/store-customer-context';
import { STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

type StoreAccountMenuProps = {
  primaryColor: string;
};

export function StoreAccountMenu({ primaryColor }: StoreAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, customer, orders, signOut } = useStoreCustomer();
  const firstName = customer?.name?.split(' ')[0] || 'cliente';
  const initials = (customer?.name || 'Cliente')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const close = () => setOpen(false);

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-slate-800 shadow-sm transition hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        aria-expanded={open}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {isAuthenticated ? initials : <UserRound className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block max-w-28 truncate text-xs font-black">
            {isAuthenticated ? firstName : 'Entrar'}
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {isAuthenticated ? 'Minha conta' : 'Criar conta'}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={close}
            aria-label="Fechar menu de conta"
          />
          <div className="absolute right-0 z-50 mt-2 w-[290px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
            <div className="rounded-xl bg-slate-50 px-3 pb-3 pt-2">
              <p className="text-sm font-black text-slate-950">
                {isAuthenticated ? `Ola, ${firstName}` : 'Ola, cliente!'}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {isAuthenticated
                  ? `${orders.length} pedido(s) vinculados a sua conta.`
                  : 'Entre ou crie sua conta para acompanhar pedidos e salvar enderecos.'}
              </p>
            </div>

            <div className="mt-2 space-y-1">
              {isAuthenticated ? (
                <>
                  <MenuLink href={STORE_ROUTES.account} icon={<UserRound className="h-4 w-4" />} onClick={close}>Minha conta</MenuLink>
                  <MenuLink href={STORE_ROUTES.orders} icon={<PackageSearch className="h-4 w-4" />} onClick={close}>Meus pedidos</MenuLink>
                  <MenuLink href={STORE_ROUTES.addresses} icon={<MapPin className="h-4 w-4" />} onClick={close}>Enderecos</MenuLink>
                  <MenuLink href={STORE_ROUTES.security} icon={<LockKeyhole className="h-4 w-4" />} onClick={close}>Seguranca e senha</MenuLink>
                  <MenuLink href={STORE_ROUTES.privacy} icon={<ShieldCheck className="h-4 w-4" />} onClick={close}>Privacidade e preferencias</MenuLink>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      signOut();
                    }}
                    className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-rose-500 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </>
              ) : (
                <>
                  <MenuLink href={STORE_ROUTES.login} icon={<LogIn className="h-4 w-4" />} onClick={close}>Entrar na minha conta</MenuLink>
                  <Link
                    href={STORE_ROUTES.signup}
                    onClick={close}
                    className="flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-center text-sm font-black text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Criar minha conta
                  </Link>
                  <MenuLink href={withStoreRedirect(STORE_ROUTES.login, STORE_ROUTES.orders)} icon={<PackageSearch className="h-4 w-4" />} onClick={close}>Acompanhar meus pedidos</MenuLink>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onClick
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
    >
      <span className="text-slate-400">{icon}</span>
      {children}
    </Link>
  );
}
