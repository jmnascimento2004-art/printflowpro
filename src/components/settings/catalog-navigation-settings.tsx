'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Check, ChevronRight, ImagePlus, Pencil, X } from 'lucide-react';
import type { Category } from '@/lib/dummy-data';
import type { CategoryCatalogPresentationPatch } from '@/context/database-context';
import { uploadCatalogImage } from '@/lib/catalog-images';
import { supabase } from '@/lib/supabaseClient';
import { CATALOG_IMAGE_SPECS, formatCatalogImageMaxSize } from '@/lib/store/catalog-image-specs';

interface Props {
  companyId: string;
  categories: Category[];
  updateCategory: (id: string, patch: CategoryCatalogPresentationPatch) => Promise<void>;
  notify: (message: string) => void;
}
const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary';
const checkboxClass = 'h-4 w-4 rounded border-border text-primary';

const getDraft = (category: Category): CategoryCatalogPresentationPatch => ({
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

function CategoryEditor({ category, companyId, updateCategory, notify, onClose }: Props & { category: Category; onClose: () => void }) {
  const [draft, setDraft] = useState(() => getDraft(category));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const spec = CATALOG_IMAGE_SPECS.megaMenu;
  const patch = (value: Partial<CategoryCatalogPresentationPatch>) => setDraft((current) => ({ ...current, ...value }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const publicUrl = await uploadCatalogImage(supabase, file, { companyId, purpose: 'mega-menu', label: category.name });
      patch({ catalog_mega_menu_banner_image_url: publicUrl });
      notify('Imagem enviada. Salve a categoria para confirmar a alteração.');
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
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/55" role="dialog" aria-modal="true" aria-labelledby="catalog-category-editor-title">
      <button type="button" aria-label="Fechar edição da categoria" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-4 shadow-2xl sm:p-6" data-testid="catalog-category-editor">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div><p className="text-[10px] font-black uppercase tracking-wider text-primary">Apresentação no catálogo</p><h3 id="catalog-category-editor-title" className="mt-1 text-lg font-black text-foreground">{category.name}</h3><p className="mt-1 text-xs text-muted-foreground">A taxonomia estrutural continua no módulo Produtos.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar painel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-5 py-5">
          <section className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
            <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-bold text-foreground"><span><span className="block">Categoria em destaque</span><span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Inclui a categoria na navegação destacada da loja.</span></span><input className={checkboxClass} type="checkbox" checked={draft.catalog_featured === true} onChange={(event) => patch({ catalog_featured: event.target.checked })} /></label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Título exibido<input className={fieldClass} value={draft.catalog_featured_title || ''} onChange={(event) => patch({ catalog_featured_title: event.target.value })} placeholder={category.name} /></label>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Ordem<input className={fieldClass} type="number" min="0" value={draft.catalog_featured_sort_order || 0} onChange={(event) => patch({ catalog_featured_sort_order: Number(event.target.value) })} /></label>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
            <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-bold text-foreground"><span><span className="block">Mega Menu ativo</span><span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Expande subcategorias e produtos reais desta categoria.</span></span><input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_enabled === true} onChange={(event) => patch({ catalog_mega_menu_enabled: event.target.checked })} /></label>
            {draft.catalog_mega_menu_enabled && (
              <div className="space-y-3 border-t border-border pt-3">
                <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-semibold text-foreground">Exibir banner promocional<input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_banner_enabled === true} onChange={(event) => patch({ catalog_mega_menu_banner_enabled: event.target.checked })} /></label>
                {draft.catalog_mega_menu_banner_enabled && (
                  <>
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-[10px] leading-4 text-muted-foreground" data-testid="catalog-image-spec-megaMenu">
                      <p className="font-black uppercase text-primary">Tamanho recomendado: {spec.recommendedWidth} × {spec.recommendedHeight} px</p>
                      <p>Proporção: {spec.aspectRatio} · Formatos: {spec.acceptedFormats} · Máximo: {formatCatalogImageMaxSize(spec.maxFileSizeBytes)}</p>
                      <p>Recomendamos WebP. Outros tamanhos são aceitos, mas o slot usa corte proporcional.</p>
                    </div>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary"><ImagePlus className="h-4 w-4" />{uploading ? 'Enviando…' : 'Selecionar banner do Mega Menu'}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label>
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground">Texto alternativo<input className={fieldClass} value={draft.catalog_mega_menu_banner_alt || ''} onChange={(event) => patch({ catalog_mega_menu_banner_alt: event.target.value })} /></label>
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground">Link/destino<input className={fieldClass} value={draft.catalog_mega_menu_banner_link || ''} onChange={(event) => patch({ catalog_mega_menu_banner_link: event.target.value })} placeholder="/store?categoria=... ou https://..." /></label>
                    <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground"><input className={checkboxClass} type="checkbox" checked={draft.catalog_mega_menu_banner_new_tab === true} onChange={(event) => patch({ catalog_mega_menu_banner_new_tab: event.target.checked })} />Abrir destino em nova aba</label>
                    {draft.catalog_mega_menu_banner_image_url && <div><p className="mb-1 text-[10px] font-black uppercase text-muted-foreground">Preview do slot</p><div className="relative mx-auto aspect-[15/16] w-full max-w-60 overflow-hidden rounded-xl border border-border bg-slate-900"><Image unoptimized fill sizes="240px" src={draft.catalog_mega_menu_banner_image_url} alt={draft.catalog_mega_menu_banner_alt || `Banner ${category.name}`} className="object-cover" /></div></div>}
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-card py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-xs font-bold text-foreground">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving || uploading} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Salvando…' : 'Salvar apresentação'}</button>
        </div>
      </section>
    </div>
  );
}

export function CatalogNavigationSettings(props: Props) {
  const rootCategories = useMemo(() => props.categories
    .filter((category) => category.show_in_catalog !== false)
    .filter((category) => !category.parent_id || !props.categories.some((item) => item.id === category.parent_id))
    .sort((left, right) => {
      const leftOrder = left.catalog_featured_sort_order || Number.MAX_SAFE_INTEGER;
      const rightOrder = right.catalog_featured_sort_order || Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    }), [props.categories]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingCategory = rootCategories.find((category) => category.id === editingId) || null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="catalog-navigation-settings">
      <div className="border-b border-border pb-3"><h3 className="text-sm font-black uppercase tracking-wide text-foreground">Categorias em destaque e Mega Menu</h3><p className="mt-1 text-xs text-muted-foreground">Edite somente apresentação, ordem e merchandising. Nome, hierarquia e associação de produtos permanecem em Produtos.</p></div>
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-xs"><thead className="bg-secondary/40 text-[10px] uppercase text-muted-foreground"><tr><th className="px-4 py-3">Categoria</th><th className="px-3 py-3">Destaque</th><th className="px-3 py-3">Mega Menu</th><th className="px-3 py-3">Ordem</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{rootCategories.map((category) => <tr key={category.id} className="bg-background"><td className="px-4 py-3 font-bold text-foreground">{category.name}</td><td className="px-3 py-3">{category.catalog_featured ? 'Sim' : 'Não'}</td><td className="px-3 py-3">{category.catalog_mega_menu_enabled ? 'Sim' : 'Não'}</td><td className="px-3 py-3">{category.catalog_featured ? category.catalog_featured_sort_order || 0 : '—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${category.show_in_catalog !== false ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>{category.show_in_catalog !== false ? 'Ativo' : 'Oculto'}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditingId(category.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-bold text-primary"><Pencil className="h-4 w-4" />Editar</button></td></tr>)}</tbody></table>
      </div>
      <div className="grid gap-3 md:hidden">{rootCategories.map((category) => <button key={category.id} type="button" onClick={() => setEditingId(category.id)} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 text-left"><span><span className="block text-xs font-black text-foreground">{category.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">Destaque: {category.catalog_featured ? 'Sim' : 'Não'} · Mega Menu: {category.catalog_mega_menu_enabled ? 'Sim' : 'Não'}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-primary" /></button>)}</div>
      {rootCategories.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">Cadastre categorias principais visíveis em Produtos para configurá-las aqui.</p>}
      {editingCategory && <CategoryEditor {...props} category={editingCategory} onClose={() => setEditingId(null)} />}
    </section>
  );
}
