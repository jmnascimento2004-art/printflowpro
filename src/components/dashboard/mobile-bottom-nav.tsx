'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calculator,
  DollarSign,
  ExternalLink,
  FileText,
  Home,
  LayoutGrid,
  Layers,
  MoreHorizontal,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wrench,
  X
} from 'lucide-react';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { useAuth } from '@/context/auth-context';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/dashboard', icon: Home, primary: true },
  { name: 'PDV', path: '/pos', icon: ShoppingBag, primary: true },
  { name: 'Clientes', path: '/crm', icon: Users, primary: true },
  { name: 'Produtos', path: '/products', icon: Package, primary: true },
  { name: 'Orcamentos', path: '/quotes', icon: FileText },
  { name: 'Precificacao', path: '/pricing', icon: Calculator },
  { name: 'Pedidos', path: '/orders', icon: LayoutGrid },
  { name: 'Producao', path: '/production', icon: Wrench },
  { name: 'Financeiro', path: '/financial', icon: DollarSign },
  { name: 'Estoque', path: '/stock', icon: Layers },
  { name: 'Expedicao', path: '/shipment', icon: Truck },
  { name: 'Revenda', path: '/resale', icon: ExternalLink },
  { name: 'Ajustes', path: '/settings', icon: Settings }
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { activeProfile } = useAuth();
  const { rolePermissions } = useDatabase();
  const [moreOpen, setMoreOpen] = useState(false);

  const allowedItems = NAV_ITEMS.filter((item) => {
    const roles = rolePermissions[item.path] || DEFAULT_ROLE_PERMISSIONS[item.path] || [];
    return roles.includes(activeProfile.role);
  });

  const primaryItems = allowedItems.filter((item) => item.primary).slice(0, 4);
  const secondaryItems = allowedItems.filter((item) => !primaryItems.some((primary) => primary.path === item.path));
  const isSecondaryActive = secondaryItems.some((item) => pathname.startsWith(item.path));

  return (
    <>
      {moreOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
          />

          <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-border bg-card p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Mais modulos</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground"
                aria-label="Fechar menu de modulos"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid max-h-[52dvh] grid-cols-3 gap-2 overflow-y-auto pr-1">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition-all ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                        : 'border-border bg-secondary/25 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="max-w-full truncate text-[10px] font-bold leading-tight">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur md:hidden no-print">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 pb-[calc(0.6rem+env(safe-area-inset-bottom))]">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMoreOpen(false)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-center transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate text-[10px] font-black leading-tight">{item.name}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-center transition-all ${
              moreOpen || isSecondaryActive
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate text-[10px] font-black leading-tight">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
