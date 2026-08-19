'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Menu, Sparkles, X } from 'lucide-react';
import type { Category, Product } from '@/lib/dummy-data';
import { safeHref } from '@/lib/safe-url';

type Props = {
  categories: Category[];
  products: Product[];
  selectedCategory: string | null;
  primary: string;
  primaryText: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSelectCategory: (categoryId: string | null) => void;
  onOpenProduct: (product: Product) => void;
};

export function CatalogCategoryNavigation({
  categories,
  products,
  selectedCategory,
  primary,
  primaryText,
  mobileOpen,
  onMobileOpenChange,
  onSelectCategory,
  onOpenProduct
}: Props) {
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const [megaMenuCategoryId, setMegaMenuCategoryId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const childrenByParent = useMemo(() => categories.reduce<Record<string, Category[]>>((result, category) => {
    if (category.parent_id) result[category.parent_id] = [...(result[category.parent_id] || []), category];
    return result;
  }, {}), [categories]);

  const categoryHasProducts = (categoryId: string) => {
    const ids = [categoryId, ...(childrenByParent[categoryId] || []).map((child) => child.id)];
    return products.some((product) => ids.includes(product.category_id));
  };

  const rootCategories = categories
    .filter((category) => !category.parent_id || !categories.some((candidate) => candidate.id === category.parent_id))
    .filter((category) => categoryHasProducts(category.id));
  const featuredCategories = rootCategories
    .filter((category) => category.catalog_featured === true)
    .sort((a, b) => (a.catalog_featured_sort_order || 0) - (b.catalog_featured_sort_order || 0) || a.name.localeCompare(b.name));
  const normalCategories = rootCategories.filter((category) => category.catalog_featured !== true);
  const megaCategory = categories.find((category) => category.id === megaMenuCategoryId) || null;

  useEffect(() => {
    if (!megaMenuCategoryId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMegaMenuCategoryId(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMegaMenuCategoryId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [megaMenuCategoryId]);

  const select = (categoryId: string) => {
    setMegaMenuCategoryId(null);
    onSelectCategory(selectedCategory === categoryId ? null : categoryId);
  };

  const openProduct = (product: Product) => {
    setMegaMenuCategoryId(null);
    onMobileOpenChange(false);
    onOpenProduct(product);
  };

  const toggleNormalCategory = (category: Category) => {
    const hasChildren = (childrenByParent[category.id] || []).some((child) => categoryHasProducts(child.id));
    if (selectedCategory === category.id) {
      select(category.id);
      return;
    }
    if (hasChildren) {
      setExpandedCategoryIds((current) => {
        const next = new Set(current);
        if (next.has(category.id)) next.delete(category.id);
        else next.add(category.id);
        return next;
      });
      return;
    }
    select(category.id);
  };

  const toggleFeaturedCategory = (category: Category) => {
    if (selectedCategory === category.id) {
      select(category.id);
      return;
    }
    if (category.catalog_mega_menu_enabled) {
      setMegaMenuCategoryId((current) => current === category.id ? null : category.id);
      return;
    }
    select(category.id);
  };

  const renderMegaContent = (category: Category, mobile = false) => {
    const subcategories = (childrenByParent[category.id] || []).filter((child) => categoryHasProducts(child.id));
    const directProducts = products.filter((product) => product.category_id === category.id);
    return (
      <div className={mobile ? 'space-y-3 border-t border-border/60 px-2 pb-3 pt-2' : 'grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_240px]'}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subcategories.map((subcategory) => (
            <section key={subcategory.id} aria-labelledby={`mega-category-${subcategory.id}`}>
              <button id={`mega-category-${subcategory.id}`} type="button" onClick={() => select(subcategory.id)} className="min-h-11 text-left text-xs font-black text-slate-900 hover:text-emerald-600 dark:text-white">
                {subcategory.name}
              </button>
              <ul className="space-y-1">
                {products.filter((product) => product.category_id === subcategory.id).slice(0, 6).map((product) => (
                  <li key={product.id}><button type="button" onClick={() => openProduct(product)} className="min-h-11 w-full rounded-lg px-2 text-left text-[11px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white">{product.name}</button></li>
                ))}
              </ul>
            </section>
          ))}
          {directProducts.length > 0 && (
            <section aria-labelledby={`mega-products-${category.id}`}>
              <button id={`mega-products-${category.id}`} type="button" onClick={() => select(category.id)} className="min-h-11 text-left text-xs font-black text-slate-900 hover:text-emerald-600 dark:text-white">{category.catalog_featured_title || category.name}</button>
              <ul className="space-y-1">
                {directProducts.slice(0, 8).map((product) => (
                  <li key={product.id}><button type="button" onClick={() => openProduct(product)} className="min-h-11 w-full rounded-lg px-2 text-left text-[11px] text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">{product.name}</button></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {category.catalog_mega_menu_banner_enabled && category.catalog_mega_menu_banner_image_url && (
          <a
            href={safeHref(category.catalog_mega_menu_banner_link || '#')}
            target={category.catalog_mega_menu_banner_new_tab ? '_blank' : undefined}
            rel={category.catalog_mega_menu_banner_new_tab ? 'noopener noreferrer' : undefined}
            onClick={() => setMegaMenuCategoryId(null)}
            className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Image unoptimized width={600} height={640} src={category.catalog_mega_menu_banner_image_url} alt={category.catalog_mega_menu_banner_alt || `Promoção ${category.name}`} className="h-full max-h-64 w-full object-cover" />
          </a>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="contents" data-testid="catalog-category-navigation">
      <button
        type="button"
        onClick={() => onMobileOpenChange(!mobileOpen)}
        className="flex min-h-11 w-full items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="catalog-mobile-categories"
      >
        <span className="flex items-center gap-2"><Menu className="h-4 w-4" /> Categorias</span>
      </button>

      <aside id="catalog-mobile-categories" className={`${mobileOpen ? 'block' : 'hidden'} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-24 lg:block`} aria-label="Categorias do catálogo">
        <nav className="space-y-1">
          {featuredCategories.map((category) => {
            const open = megaMenuCategoryId === category.id;
            return (
              <div key={category.id}>
                <button
                  type="button"
                  onClick={() => toggleFeaturedCategory(category)}
                  className="flex min-h-11 w-full items-center rounded-xl bg-amber-50 px-3 text-left text-xs font-black text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20"
                  aria-haspopup={category.catalog_mega_menu_enabled ? true : undefined}
                  aria-expanded={category.catalog_mega_menu_enabled ? open : undefined}
                  aria-controls={category.catalog_mega_menu_enabled ? `catalog-mega-menu-mobile-${category.id} catalog-mega-menu-${category.id}` : undefined}
                >
                  <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />{category.catalog_featured_title || category.name}</span>
                </button>
                {open && <div id={`catalog-mega-menu-mobile-${category.id}`} className="lg:hidden">{renderMegaContent(category, true)}</div>}
              </div>
            );
          })}

          {normalCategories.map((category) => {
            const children = (childrenByParent[category.id] || []).filter((child) => categoryHasProducts(child.id));
            const expanded = expandedCategoryIds.has(category.id);
            return (
              <div key={category.id}>
                <button
                  type="button"
                  onClick={() => toggleNormalCategory(category)}
                  className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selectedCategory === category.id || expanded ? 'font-black' : ''} ${selectedCategory === category.id ? '' : expanded ? 'bg-slate-50 text-slate-900 dark:bg-zinc-800/70 dark:text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800'}`}
                  style={selectedCategory === category.id ? { backgroundColor: primary, color: primaryText } : undefined}
                  aria-expanded={children.length > 0 ? expanded : undefined}
                  aria-controls={children.length > 0 ? `catalog-category-children-${category.id}` : undefined}
                >
                  <span>{category.name}</span>
                </button>
                {children.length > 0 && expanded && (
                  <div id={`catalog-category-children-${category.id}`} className="space-y-1 py-1">
                    <button type="button" onClick={() => select(category.id)} className={`flex min-h-11 w-full items-center rounded-xl py-2 pl-8 pr-3 text-left text-[11px] font-bold transition-colors ${selectedCategory === category.id ? '' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800'}`} style={selectedCategory === category.id ? { backgroundColor: primary, color: primaryText } : undefined}>Ver todos em {category.name}</button>
                    {children.map((child) => (
                      <button key={child.id} type="button" onClick={() => select(child.id)} className={`flex min-h-11 w-full items-center rounded-xl py-2 pl-8 pr-3 text-left text-[11px] font-semibold transition-colors ${selectedCategory === child.id ? '' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`} style={selectedCategory === child.id ? { backgroundColor: primary, color: primaryText } : undefined}>{child.name}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {megaCategory?.catalog_mega_menu_enabled && (
        <section id={`catalog-mega-menu-${megaCategory.id}`} role="region" aria-label={`Mega Menu ${megaCategory.name}`} className="absolute left-[260px] right-0 top-0 z-30 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 lg:block">
          <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-5 dark:border-zinc-800">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">{megaCategory.catalog_featured_title || megaCategory.name}</h3>
            <button type="button" onClick={() => setMegaMenuCategoryId(null)} aria-label="Fechar Mega Menu" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
          </div>
          {renderMegaContent(megaCategory)}
        </section>
      )}
    </div>
  );
}
