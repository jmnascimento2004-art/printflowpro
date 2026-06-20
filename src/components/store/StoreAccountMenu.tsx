'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LockKeyhole, LogIn, LogOut, MapPin, PackageSearch, ShieldCheck, UserRound } from 'lucide-react';
import { useStoreCustomer } from '@/context/store-customer-context';
import { storeRoutes, withStoreRedirect } from '@/lib/store-routes';

type StoreAccountMenuProps = {
  primaryColor: string;
};

export function StoreAccountMenu({ primaryColor }: StoreAccountMenuProps) {
  const router = useRouter();
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
  const navigate = (href: string) => {
    close();
    router.push(href);
  };

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
          <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="border-b border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">
                {isAuthenticated ? `Ola, ${firstName}` : 'Ola, cliente!'}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {isAuthenticated
                  ? `${orders.length} pedido(s) vinculados a sua conta.`
                  : 'Entre ou crie sua conta para acompanhar pedidos e salvar enderecos.'}
              </p>
            </div>

            <div className="p-2">
              {isAuthenticated ? (
                <>
                  <MenuAction icon={<UserRound className="h-4 w-4" />} onClick={() => navigate(storeRoutes.account)}>Minha conta</MenuAction>
                  <MenuAction icon={<PackageSearch className="h-4 w-4" />} onClick={() => navigate(storeRoutes.orders)}>Meus pedidos</MenuAction>
                  <MenuAction icon={<MapPin className="h-4 w-4" />} onClick={() => navigate(storeRoutes.addresses)}>Enderecos</MenuAction>
                  <MenuAction icon={<LockKeyhole className="h-4 w-4" />} onClick={() => navigate(storeRoutes.security)}>Seguranca e senha</MenuAction>
                  <MenuAction icon={<ShieldCheck className="h-4 w-4" />} onClick={() => navigate(storeRoutes.privacy)}>Privacidade e preferencias</MenuAction>
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
                  <MenuAction icon={<LogIn className="h-4 w-4" />} onClick={() => navigate(storeRoutes.login)}>Entrar na minha conta</MenuAction>
                  <button
                    type="button"
                    onClick={() => navigate(storeRoutes.signup)}
                    className="mt-1 flex min-h-11 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Criar minha conta
                  </button>
                  <MenuAction icon={<PackageSearch className="h-4 w-4" />} onClick={() => navigate(withStoreRedirect(storeRoutes.login, storeRoutes.orders))}>Acompanhar meus pedidos</MenuAction>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuAction({
  icon,
  children,
  onClick
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
    >
      <span className="text-slate-400">{icon}</span>
      {children}
    </button>
  );
}
