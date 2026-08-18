'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Check, ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { Category } from '@/lib/dummy-data';
import type { CategoryCatalogPresentationPatch, StoreBanner } from '@/context/database-context';
import { uploadCatalogImage } from '@/lib/catalog-images';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  companyId: string;
  categories: Category[];
  banners: StoreBanner[];
  addBanner: (banner: Omit<StoreBanner, 'id'>) => StoreBanner;
  updateBanner: (id: string, patch: Partial<Omit<StoreBanner, 'id'>>) => void;
  deleteBanner: (id: string) => void;
  updateCategory: (id: string, patch: CategoryCatalogPresentationPatch) => Promise<void>;
  notify: (message: string) => void;
};

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary';
const checkboxClass = 'h-4 w-4 rounded border-border accent-primary';

function CategoryPresentationEditor({
  category,
  companyId,
  updateCategory,
  notify
}: Pick<Props, 'companyId' | 'updateCategory' | 'notify'> & { category: Category }) {
  const [draft, setDraft] = useState<CategoryCatalogPresentationPatch>({
    catalog_featured: category.catalog_featured === true,
    catalog_featured_title: category.catalog_featured_title || '',
    catalog_featured_sort_order: category.catalog_featured_sort_order || 0,
    catalog_mega_menu_enabled: category.catalog_mega_menu_enabled === true,
    catalog_mega_menu_banner_enabled: category.catalog_mega_menu_banner_enabled === true,
    catalog_mega_menu_banner_image_url: category.catalog_mega_menu_banner_image_url || '',
    catalog_mega_menu_banner_link: category.catalog_mega_menu_banner_link || '',
    catalog_mega_menu_banner_alt: category.catalog_mega_menu_banner_alt || '',
    catalog_mega_menu_banner_new_tab: category.catalog_mega_menu_banner_new_tab === true
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDraft({
      catalog_featured: category.catalog_featured === true,
      catalog_featured_title: category.catalog_featured_title || '',
      catalog_featured_sort_order: category.catalog_featured_sort_order || 0,
      catalog_mega_menu_enabled: category.catalog_mega_menu_enabled === true,
      catalog_mega_menu_banner_enabled: category.catalog_mega_menu_banner_enabled === true,
      catalog_mega_menu_banner_image_url: category.catalog_mega_menu_banner_image_url || '',
      catalog_mega_menu_banner_link: category.catalog_mega_menu_banner_link || '',
      catalog_mega_menu_banner_alt: category.catalog_mega_menu_banner_alt || '',
      catalog_mega_menu_banner_new_tab: category.catalog_mega_menu_banner_new_tab === true
    });
  }, [category]);

  const patch = (value: Partial<CategoryCatalogPresentationPatch>) => setDraft((current) => ({ ...current, ...value }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const publicUrl = await uploadCatalogImage(supabase, file, {
        companyId,
        purpose: 'mega-menu',
        label: category.name
      });
      patch({ catalog_mega_menu_banner_image_url: publicUrl });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível enviar a imagem do Mega Menu.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateCategory(category.id, draft);
      notify(`Apresentação de ${category.name} salva.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4" data-testid={`catalog-category-presentation-${category.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-foreground">{category.name}</h4>
          <p className="text-[10px] text-muted-foreground">Categoria principal do catálogo</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground">
          <input className={checkboxClass} type="checkbox" checked={draft.catalog_featured === true} onChange={(event) => patch({ catalog_featured: event.target.checked })} />
          Categoria em destaque
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px]">
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Título exibido
          <input className={fieldClass} value={draft.catalog_featured_title || ''} onChange={(event) => patch({ catalog_featured_title: event.target.value })} placeholder={category.name} />
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Ordem
          <input className={fieldClass} type="number" min="0" value={draft.catalog_featured_sort_order || 0} onChange={(event) => patch({ catalog_featured_sort_order: Number(event.target.value) })} />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground">
        <input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_enabled === true} onChange={(event) => patch({ catalog_mega_menu_enabled: event.target.checked })} />
        Abrir Mega Menu com subcategorias e produtos
      </label>

      {draft.catalog_mega_menu_enabled && (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground">
            <input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_banner_enabled === true} onChange={(event) => patch({ catalog_mega_menu_banner_enabled: event.target.checked })} />
            Exibir banner promocional no Mega Menu
          </label>
          {draft.catalog_mega_menu_banner_enabled && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
                  Imagem
                  <span className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 text-xs normal-case text-foreground hover:border-primary">
                    <ImagePlus className="h-4 w-4" /> {uploading ? 'Enviando…' : 'Enviar imagem'}
                    <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
                  </span>
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
                  Texto alternativo
                  <input className={fieldClass} value={draft.catalog_mega_menu_banner_alt || ''} onChange={(event) => patch({ catalog_mega_menu_banner_alt: event.target.value })} />
                </label>
              </div>
              <label className="block space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
                Destino
                <input className={fieldClass} value={draft.catalog_mega_menu_banner_link || ''} onChange={(event) => patch({ catalog_mega_menu_banner_link: event.target.value })} placeholder="/store?categoria=... ou https://..." />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-xs text-foreground">
                <input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_banner_new_tab === true} onChange={(event) => patch({ catalog_mega_menu_banner_new_tab: event.target.checked })} />
                Abrir destino em nova aba
              </label>
              {draft.catalog_mega_menu_banner_image_url && <Image unoptimized width={900} height={300} src={draft.catalog_mega_menu_banner_image_url} alt={draft.catalog_mega_menu_banner_alt || `Banner ${category.name}`} className="max-h-36 w-full rounded-lg object-cover" />}
            </>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving || uploading} className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
          <Check className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar categoria'}
        </button>
      </div>
    </article>
  );
}

export function CatalogNavigationSettings({ companyId, categories, banners, addBanner, updateBanner, deleteBanner, updateCategory, notify }: Props) {
  const rootCategories = useMemo(() => categories
    .filter((category) => category.show_in_catalog !== false)
    .filter((category) => !category.parent_id || !categories.some((item) => item.id === category.parent_id))
    .sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const commercialBanners = useMemo(() => banners
    .filter((banner) => banner.placement === 'catalog')
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [banners]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [mobileImageFile, setMobileImageFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [alt, setAlt] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [saving, setSaving] = useState(false);

  const addCommercialBanner = async () => {
    if (!imageFile || !alt.trim()) {
      notify('Informe a imagem desktop e o texto alternativo do banner comercial.');
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadCatalogImage(supabase, imageFile, { companyId, purpose: 'commercial-banner', label: title || alt });
      const mobileImageUrl = mobileImageFile
        ? await uploadCatalogImage(supabase, mobileImageFile, { companyId, purpose: 'commercial-banner', label: `${title || alt}-mobile` })
        : null;
      addBanner({
        image_url: imageUrl,
        mobile_image_url: mobileImageUrl,
        title: title.trim() || undefined,
        link: link.trim() || undefined,
        alt_text: alt.trim(),
        placement: 'catalog',
        active: true,
        sort_order: commercialBanners.length,
        open_in_new_tab: newTab
      });
      setImageFile(null);
      setMobileImageFile(null);
      setTitle('');
      setLink('');
      setAlt('');
      setNewTab(false);
      notify('Banner comercial adicionado.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível adicionar o banner comercial.');
    } finally {
      setSaving(false);
    }
  };

  const moveBanner = (banner: StoreBanner, direction: -1 | 1) => {
    const index = commercialBanners.findIndex((item) => item.id === banner.id);
    const target = commercialBanners[index + direction];
    if (!target) return;
    updateBanner(banner.id, { sort_order: target.sort_order ?? index + direction });
    updateBanner(target.id, { sort_order: banner.sort_order ?? index });
  };

  return (
    <div className="space-y-6" data-testid="catalog-navigation-settings">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Banners comerciais</h3>
          <p className="mt-1 text-xs text-muted-foreground">Aparecem acima da grade de produtos, em duas colunas no desktop e empilhados no celular.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Título interno<input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Texto alternativo *<input className={fieldClass} value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
          <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Imagem desktop *<input className={`${fieldClass} min-h-11`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label>
          <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Imagem mobile (opcional)<input className={`${fieldClass} min-h-11`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setMobileImageFile(event.target.files?.[0] || null)} /></label>
          <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground md:col-span-2">Destino<input className={fieldClass} value={link} onChange={(event) => setLink(event.target.value)} /></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-2 text-xs text-foreground"><input className={checkboxClass} type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} />Abrir em nova aba</label>
          <button type="button" onClick={() => void addCommercialBanner()} disabled={saving} className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? 'Enviando…' : 'Adicionar banner'}</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {commercialBanners.map((banner, index) => (
            <article key={banner.id} className="overflow-hidden rounded-xl border border-border bg-background">
              <Image unoptimized width={900} height={300} src={banner.image_url} alt={banner.alt_text || banner.title || 'Banner comercial'} className="aspect-[3/1] w-full object-cover" />
              <div className="space-y-3 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                  <input className={fieldClass} value={banner.alt_text || ''} aria-label={`Texto alternativo de ${banner.title || 'banner'}`} onChange={(event) => updateBanner(banner.id, { alt_text: event.target.value })} />
                  <input className={fieldClass} type="number" min="0" value={banner.sort_order || 0} aria-label={`Ordem de ${banner.title || 'banner'}`} onChange={(event) => updateBanner(banner.id, { sort_order: Number(event.target.value) })} />
                </div>
                <input className={fieldClass} value={banner.link || ''} aria-label={`Destino de ${banner.title || 'banner'}`} placeholder="Destino do banner" onChange={(event) => updateBanner(banner.id, { link: event.target.value })} />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-3">
                    <label className="flex min-h-11 items-center gap-2 text-xs text-foreground"><input className={checkboxClass} type="checkbox" checked={banner.active !== false} onChange={(event) => updateBanner(banner.id, { active: event.target.checked })} />Ativo</label>
                    <label className="flex min-h-11 items-center gap-2 text-xs text-foreground"><input className={checkboxClass} type="checkbox" checked={banner.open_in_new_tab === true} onChange={(event) => updateBanner(banner.id, { open_in_new_tab: event.target.checked })} />Nova aba</label>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" aria-label="Mover banner para cima" disabled={index === 0} onClick={() => moveBanner(banner, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Mover banner para baixo" disabled={index === commercialBanners.length - 1} onClick={() => moveBanner(banner, 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label="Excluir banner comercial" onClick={() => deleteBanner(banner.id)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rose-500/30 text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {commercialBanners.length === 0 && <p className="md:col-span-2 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Nenhum banner comercial configurado.</p>}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Categorias em destaque e Mega Menu</h3>
          <p className="mt-1 text-xs text-muted-foreground">Categorias destacadas aparecem antes de “Todos os produtos”. O Mega Menu usa subcategorias e produtos reais do catálogo.</p>
        </div>
        {rootCategories.map((category) => <CategoryPresentationEditor key={category.id} category={category} companyId={companyId} updateCategory={updateCategory} notify={notify} />)}
        {rootCategories.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Cadastre categorias principais visíveis no catálogo para configurá-las aqui.</p>}
      </section>
    </div>
  );
}
