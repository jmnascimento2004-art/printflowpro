'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Users, 
  FileText, 
  Calculator, 
  LayoutGrid, 
  Wrench, 
  DollarSign, 
  Package, 
  Truck, 
  ExternalLink, 
  Settings, 
  ShoppingBag,
  LogOut,
  Layers
} from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDatabase, DEFAULT_ROLE_PERMISSIONS } from '@/context/database-context';
import { useAuth } from '@/context/auth-context';
import { BrandLogo, BrandMark } from '@/components/brand';

export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (o: boolean) => void }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const { company, rolePermissions } = useDatabase();
  const { activeProfile } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const storeDomain = (company.store_domain || company.custom_domain || '').trim();
  const storeHref = storeDomain ? `https://${storeDomain.replace(/^https?:\/\//, '')}/store` : '/store';

  // Check window resize
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsMobile(true);
        setIsOpen(false);
      } else {
        setIsMobile(false);
        setIsOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsOpen]);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: Home },
    { name: 'PDV / Caixa', path: '/pos', icon: ShoppingBag },
    { name: 'CRM Clientes', path: '/crm', icon: Users },
    { name: 'Produtos (Catálogo)', path: '/products', icon: Package },
    { name: 'Orçamentos', path: '/quotes', icon: FileText },
    { name: 'Precificação', path: '/pricing', icon: Calculator },
    { name: 'Pedidos', path: '/orders', icon: LayoutGrid },
    { name: 'Fila Produção', path: '/production', icon: Wrench },
    { name: 'Financeiro', path: '/financial', icon: DollarSign },
    { name: 'Estoque / Insumos', path: '/stock', icon: Layers },
    { name: 'Expedição', path: '/shipment', icon: Truck },
    { name: 'Revenda', path: '/resale', icon: ExternalLink },
    { name: 'Configurações', path: '/settings', icon: Settings },
  ];

  const filteredNavItems = navItems.filter(item => {
    const roles = rolePermissions[item.path] || DEFAULT_ROLE_PERMISSIONS[item.path] || [];
    return roles.includes(activeProfile.role);
  });

  const handleLinkClick = () => {
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile menu overlay */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside 
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-card border-r border-border transition-all duration-300 ${
          isOpen ? 'w-64' : 'w-16'
        } ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}`}
      >
        {/* Header/Logo section */}
        <div className="h-16 flex items-center px-4 border-b border-border gap-2">
          <div className={`flex items-center gap-2 overflow-hidden w-full ${!isOpen ? 'justify-center' : ''}`}>
            {(() => {
              const logoSrc = theme === 'dark' ? (company.logo_dark || company.logo_light) : (company.logo_light || company.logo_dark);
              const faviconSrc = company.favicon;

              if (!isOpen) {
                return faviconSrc ? (
                  <img 
                    src={faviconSrc} 
                    alt="Favicon" 
                    className="h-8 w-8 object-contain rounded-lg shrink-0"
                  />
                ) : (
                  <BrandMark className="h-8 w-8" />
                );
              }

              return logoSrc ? (
                <img 
                  src={logoSrc} 
                  alt={company.name || 'Logo'} 
                  className="h-8 w-auto max-w-[170px] object-contain transition-all duration-300"
                />
              ) : (
                <>
                  <BrandLogo className="[&>img]:h-8 [&>img]:w-8" />
                </>
              );
            })()}
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 py-4 overflow-y-auto px-2 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={handleLinkClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                title={item.name}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} />
                {isOpen && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-2 border-t border-border space-y-1 bg-secondary/30">
          <Link
            href={storeHref}
            target="_blank"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-secondary transition-all"
            title="Abrir Loja de Demonstração"
          >
            <ShoppingBag className="h-5 w-5 shrink-0" />
            {isOpen && (
              <span className="truncate flex items-center gap-1">
                Ver Loja <ExternalLink className="h-3 w-3" />
              </span>
            )}
          </Link>

          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10 transition-all"
            title="Sair do Sistema"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {isOpen && <span className="truncate">Sair / Início</span>}
          </Link>
        </div>
      </aside>
    </>
  );
}
