'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  HelpCircle,
  Home,
  Info,
  LayoutGrid,
  LockKeyhole,
  MapPin,
  MessageCircle,
  PackageSearch,
  Search,
  ShoppingCart,
  UserRound,
  X
} from 'lucide-react';
import { useStoreCustomer } from '@/context/store-customer-context';
import { STORE_ROUTES, withStoreRedirect } from '@/lib/store-routes';

type StoreCategory = {
  id: string;
  name: string;
  parent_id?: string | null;
};

type StoreMobileBottomNavigationProps = {
  categories: StoreCategory[];
  selectedCategory: string | null;
  searchQuery: string;
  cartItemCount: number;
  companyName: string;
  companyPhone?: string;
  companyEmail?: string;
  primaryColor: string;
  onGoHome: () => void;
  onSelectCategory: (categoryId: string | null) => void;
  onSearchChange: (query: string) => void;
  onOpenCart: () => void;
  onOpenPickupPoints: () => void;
  onOpenRefundPolicy: () => void;
};

export default function StoreMobileBottomNavigation({
  categories,
  selectedCategory,
  searchQuery,
  cartItemCount,
  companyName,
  companyPhone,
  companyEmail,
  primaryColor,
  onGoHome,
  onSelectCategory,
  onSearchChange,
  onOpenCart,
  onOpenPickupPoints,
  onOpenRefundPolicy
}: StoreMobileBottomNavigationProps) {
  const [sheet, setSheet] = useState<'categories' | 'search' | 'account' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { session, customer, orders, signOut } = useStoreCustomer();
  const hasStoreSession = Boolean(session?.user);

  useEffect(() => {
    if (sheet === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 120);
    }
  }, [sheet]);

  const cleanPhone = (companyPhone || '').replace(/\D/g, '');
  const whatsAppHref = cleanPhone ? `https://wa.me/55${cleanPhone}` : '';
  const rootCategories = categories.filter((category) => !category.parent_id);
  const childCategories = categories.filter((category) => category.parent_id);
  const activeAccent = { color: primaryColor };
  const homeActive = !selectedCategory && !searchQuery.trim() && !sheet;

  const closeSheet = () => setSheet(null);

  const handleCategoryClick = (categoryId: string | null) => {
    onSelectCategory(categoryId);
    closeSheet();
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeSheet();
  };

  return (
    <>
      {sheet && (
        <div className="md:hidden">
          <button
            type="button"
            className="fixed inset-0 z-[58] bg-slate-950/45 backdrop-blur-[2px]"
            onClick={closeSheet}
            aria-label="Fechar menu"
          />

          <div className="fixed inset-x-3 bottom-[calc(5.9rem+env(safe-area-inset-bottom))] z-[60] max-h-[72dvh] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                  {sheet === 'categories' ? 'Categorias' : sheet === 'search' ? 'Buscar produtos' : 'Conta e atendimento'}
                </p>
                <p className="truncate text-sm font-black text-slate-950">{companyName || 'Loja online'}</p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
                aria-label="Fechar"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {sheet === 'categories' && (
              <div className="max-h-[58dvh] overflow-y-auto p-3">
                <button
                  type="button"
                  onClick={() => handleCategoryClick(null)}
                  className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-black ${
                    selectedCategory === null
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                  style={selectedCategory === null ? { backgroundColor: primaryColor } : undefined}
                >
                  Todos os produtos
                  <PackageSearch className="h-4.5 w-4.5" />
                </button>

                <div className="space-y-2">
                  {rootCategories.map((category) => {
                    const children = childCategories.filter((child) => child.parent_id === category.id);
                    const isActive = selectedCategory === category.id || children.some((child) => child.id === selectedCategory);

                    return (
                      <div key={category.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                        <button
                          type="button"
                          onClick={() => handleCategoryClick(category.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2.5 text-left text-xs font-black uppercase tracking-wide ${
                            isActive ? 'bg-white shadow-sm' : 'text-slate-700'
                          }`}
                          style={isActive ? activeAccent : undefined}
                        >
                          <span className="min-w-0 truncate">{category.name}</span>
                          <LayoutGrid className="h-4 w-4 shrink-0" />
                        </button>

                        {children.length > 0 && (
                          <div className="mt-1 grid grid-cols-1 gap-1">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => handleCategoryClick(child.id)}
                                className={`rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                                  selectedCategory === child.id
                                    ? 'bg-white shadow-sm'
                                    : 'text-slate-500 hover:bg-white'
                                }`}
                                style={selectedCategory === child.id ? activeAccent : undefined}
                              >
                                {child.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sheet === 'search' && (
              <form onSubmit={handleSearchSubmit} className="space-y-3 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Buscar banners, adesivos, cartoes..."
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-base font-semibold text-slate-900 outline-none focus:bg-white"
                    style={{ borderColor: searchQuery ? primaryColor : undefined }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400"
                      aria-label="Limpar busca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="flex h-11 w-full items-center justify-center rounded-xl text-sm font-black text-white shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  Ver resultados
                </button>
                <p className="text-center text-[11px] font-semibold text-slate-400">
                  Os produtos filtrados aparecem automaticamente na vitrine.
                </p>
              </form>
            )}

            {sheet === 'account' && (
              <div className="max-h-[58dvh] overflow-y-auto p-3">
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-900">
                    {hasStoreSession ? `Ola, ${customer?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'cliente'}` : 'Conta do cliente'}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    {hasStoreSession
                      ? `${orders.length} pedido(s) vinculados a sua conta.`
                      : 'Entre ou crie sua conta para acompanhar pedidos e salvar enderecos.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  {hasStoreSession ? (
                    <>
                      <a
                        href={STORE_ROUTES.account}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <UserRound className="h-4.5 w-4.5 text-slate-500" />
                        Minha conta
                      </a>
                      <a
                        href={STORE_ROUTES.orders}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <PackageSearch className="h-4.5 w-4.5 text-slate-500" />
                        Meus pedidos
                      </a>
                      <a
                        href={STORE_ROUTES.addresses}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <MapPin className="h-4.5 w-4.5 text-slate-500" />
                        Enderecos
                      </a>
                      <a
                        href={STORE_ROUTES.privacy}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <Info className="h-4.5 w-4.5 text-slate-500" />
                        Privacidade
                      </a>
                      <a
                        href={STORE_ROUTES.security}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <LockKeyhole className="h-4.5 w-4.5 text-slate-500" />
                        Seguranca e senha
                      </a>
                    </>
                  ) : (
                    <>
                      <a
                        href={STORE_ROUTES.login}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <UserRound className="h-4.5 w-4.5 text-slate-500" />
                        Entrar
                      </a>
                      <a
                        href={STORE_ROUTES.signup}
                        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-black text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Criar conta
                      </a>
                      <a
                        href={withStoreRedirect(STORE_ROUTES.login, STORE_ROUTES.orders)}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                      >
                        <PackageSearch className="h-4.5 w-4.5 text-slate-500" />
                        Acompanhar pedido
                      </a>
                    </>
                  )}

                  {whatsAppHref && (
                    <a
                      href={whatsAppHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeSheet}
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
                    >
                      <MessageCircle className="h-4.5 w-4.5 text-emerald-600" />
                      Atendimento via WhatsApp
                    </a>
                  )}

                  {companyEmail && (
                    <a
                      href={`mailto:${companyEmail}`}
                      onClick={closeSheet}
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
                    >
                      <Info className="h-4.5 w-4.5 text-slate-500" />
                      Informacoes da loja
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onOpenPickupPoints();
                      closeSheet();
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                  >
                    <MapPin className="h-4.5 w-4.5 text-slate-500" />
                    Balcoes de retirada
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenRefundPolicy();
                      closeSheet();
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 text-left text-sm font-bold text-slate-700"
                  >
                    <HelpCircle className="h-4.5 w-4.5 text-slate-500" />
                    Politica de devolucao
                  </button>

                  <a
                    href="/store/privacidade"
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
                  >
                    <Info className="h-4.5 w-4.5 text-slate-500" />
                    Politicas da loja
                  </a>

                  {hasStoreSession && (
                    <button
                      type="button"
                      onClick={() => {
                        closeSheet();
                        signOut();
                      }}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-rose-200 px-3 text-left text-sm font-bold text-rose-500"
                    >
                      Sair da conta
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-[55] border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 pb-[calc(0.65rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onGoHome();
              closeSheet();
            }}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all ${
              homeActive ? 'bg-slate-100' : 'text-slate-500'
            }`}
            style={homeActive ? activeAccent : undefined}
            aria-label="Ir para inicio"
          >
            <Home className="h-5 w-5" />
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Inicio</span>
          </button>

          <button
            type="button"
            onClick={() => setSheet(sheet === 'categories' ? null : 'categories')}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all ${
              sheet === 'categories' || selectedCategory ? 'bg-slate-100' : 'text-slate-500'
            }`}
            style={sheet === 'categories' || selectedCategory ? activeAccent : undefined}
            aria-expanded={sheet === 'categories'}
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Categorias</span>
          </button>

          <button
            type="button"
            onClick={() => setSheet(sheet === 'search' ? null : 'search')}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all ${
              sheet === 'search' || searchQuery ? 'bg-slate-100' : 'text-slate-500'
            }`}
            style={sheet === 'search' || searchQuery ? activeAccent : undefined}
            aria-expanded={sheet === 'search'}
          >
            <Search className="h-5 w-5" />
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Buscar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenCart();
              closeSheet();
            }}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all ${
              cartItemCount > 0 ? 'text-white shadow-sm' : 'text-slate-500'
            }`}
            style={cartItemCount > 0 ? { backgroundColor: primaryColor } : undefined}
            aria-label={`Abrir carrinho com ${cartItemCount} itens`}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartItemCount > 0 && (
              <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-sm">
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </span>
            )}
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Carrinho</span>
          </button>

          <button
            type="button"
            onClick={() => setSheet(sheet === 'account' ? null : 'account')}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all ${
              sheet === 'account' ? 'bg-slate-100' : 'text-slate-500'
            }`}
            style={sheet === 'account' ? activeAccent : undefined}
            aria-expanded={sheet === 'account'}
          >
            <UserRound className="h-5 w-5" />
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Conta</span>
          </button>
        </div>
      </nav>
    </>
  );
}
