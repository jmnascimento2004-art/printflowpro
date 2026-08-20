'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  ImagePlus,
  Pencil,
  Plus,
  Power,
  Save,
  Trash2,
  X
} from 'lucide-react';
import type { StoreBanner } from '@/context/database-context';
import type { Product } from '@/lib/dummy-data';
import { CatalogLinkTargetPicker } from '@/components/catalog/catalog-link-target-picker';
import { uploadCatalogImage } from '@/lib/catalog-images';
import { supabase } from '@/lib/supabaseClient';
import {
  CATALOG_IMAGE_SPECS,
  formatCatalogImageMaxSize,
  type CatalogImageSpecKey
} from '@/lib/store/catalog-image-specs';

type BannerPlacement = 'hero' | 'catalog';

interface Props {
  companyId: string;
  banners: StoreBanner[];
  products: Product[];
  addBanner: (banner: Omit<StoreBanner, 'id'>) => StoreBanner;
  updateBanner: (id: string, patch: Partial<Omit<StoreBanner, 'id'>>) => void;
  deleteBanner: (id: string) => void;
  notify: (message: string) => void;
}
interface BannerDraft {
  title: string;
  subtitle: string;
  link: string;
  altText: string;
  openInNewTab: boolean;
  imageUrl: string;
  mobileImageUrl: string;
}

const emptyDraft = (): BannerDraft => ({
  title: '',
  subtitle: '',
  link: '',
  altText: '',
  openInNewTab: false,
  imageUrl: '',
  mobileImageUrl: ''
});

const draftFromBanner = (banner: StoreBanner): BannerDraft => ({
  title: banner.title || '',
  subtitle: banner.subtitle || '',
  link: banner.link || '',
  altText: banner.alt_text || '',
  openInNewTab: banner.open_in_new_tab === true,
  imageUrl: banner.image_url,
  mobileImageUrl: banner.mobile_image_url || ''
});

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary';

function useFilePreview(file: File | null) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function ImageSpecHelp({ specKey }: { specKey: CatalogImageSpecKey }) {
  const spec = CATALOG_IMAGE_SPECS[specKey];
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-[10px] leading-4 text-muted-foreground" data-testid={`catalog-image-spec-${specKey}`}>
      <p className="font-black uppercase tracking-wide text-primary">Tamanho recomendado: {spec.recommendedWidth} × {spec.recommendedHeight} px</p>
      <p>Proporção: {spec.aspectRatio} · Formatos: {spec.acceptedFormats} · Máximo: {formatCatalogImageMaxSize(spec.maxFileSizeBytes)}</p>
      <p>Recomendamos WebP para melhor desempenho. Dimensões diferentes são aceitas, mas podem sofrer corte com <code>object-fit: {spec.objectFit}</code>.</p>
    </div>
  );
}

function BannerForm({
  placement,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  products
}: {
  placement: BannerPlacement;
  initial: BannerDraft;
  submitLabel: string;
  onSubmit: (draft: BannerDraft, desktopFile: File | null, mobileFile: File | null) => Promise<void>;
  onCancel: () => void;
  products: Product[];
}) {
  const [draft, setDraft] = useState(initial);
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const desktopPreview = useFilePreview(desktopFile) || draft.imageUrl;
  const mobilePreview = useFilePreview(mobileFile) || draft.mobileImageUrl || desktopPreview;
  const isHero = placement === 'hero';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!desktopFile && !draft.imageUrl) return;
    setSaving(true);
    try {
      await onSubmit(draft, desktopFile, mobileFile);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:p-5" data-testid={`catalog-${placement}-banner-form`}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-black text-foreground">{submitLabel}</h4>
          <p className="text-[10px] text-muted-foreground">A recomendação orienta o corte; ela não bloqueia o upload.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Fechar formulário de banner" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-[10px] font-bold uppercase text-muted-foreground">Título administrativo<input className={`${fieldClass} mt-1`} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          {isHero && <label className="block text-[10px] font-bold uppercase text-muted-foreground">Subtítulo<input className={`${fieldClass} mt-1`} value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} /></label>}
          <label className="block text-[10px] font-bold uppercase text-muted-foreground">Texto alternativo<input className={`${fieldClass} mt-1`} value={draft.altText} onChange={(event) => setDraft((current) => ({ ...current, altText: event.target.value }))} /></label>
          <CatalogLinkTargetPicker products={products} value={draft.link} onChange={(link) => setDraft((current) => ({ ...current, link }))} label="Link de destino" />
          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-foreground"><input type="checkbox" checked={draft.openInNewTab} onChange={(event) => setDraft((current) => ({ ...current, openInNewTab: event.target.checked }))} className="h-4 w-4 rounded border-border text-primary" />Abrir destino em nova aba</label>
        </div>

        <div className="space-y-3">
          <ImageSpecHelp specKey={isHero ? 'heroDesktop' : 'commercialDesktop'} />
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3 text-xs font-bold text-foreground hover:border-primary">
            <ImagePlus className="h-4 w-4" /> {desktopFile || draft.imageUrl ? 'Trocar imagem desktop' : 'Selecionar imagem desktop'}
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setDesktopFile(event.target.files?.[0] || null)} />
          </label>
          <ImageSpecHelp specKey={isHero ? 'heroMobile' : 'commercialMobile'} />
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3 text-xs font-bold text-foreground hover:border-primary">
            <ImagePlus className="h-4 w-4" /> {mobileFile || draft.mobileImageUrl ? 'Trocar imagem mobile' : 'Imagem mobile opcional'}
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setMobileFile(event.target.files?.[0] || null)} />
          </label>
        </div>
      </div>

      {desktopPreview && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" data-testid="catalog-banner-live-preview">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase text-muted-foreground">Preview desktop</p>
            <div className={`relative overflow-hidden rounded-xl border border-border bg-slate-900 ${isHero ? 'aspect-[61/15]' : 'aspect-[3/1]'}`}>
              <Image unoptimized fill sizes="(min-width: 1024px) 760px, 100vw" src={desktopPreview} alt="Preview desktop" className="object-cover" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase text-muted-foreground">Preview mobile</p>
            <div className={`relative overflow-hidden rounded-xl border border-border bg-slate-900 ${isHero ? 'aspect-[2/1]' : 'aspect-[3/1]'}`}>
              <Image unoptimized fill sizes="280px" src={mobilePreview} alt="Preview mobile" className="object-cover" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-xs font-bold text-foreground">Cancelar</button>
        <button type="submit" disabled={saving || (!desktopFile && !draft.imageUrl)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Salvando…' : submitLabel}</button>
      </div>
    </form>
  );
}

function BannerList({
  title,
  description,
  placement,
  companyId,
  banners,
  products,
  addBanner,
  updateBanner,
  deleteBanner,
  notify
}: Props & { title: string; description: string; placement: BannerPlacement }) {
  const filtered = useMemo(() => banners
    .filter((banner) => (banner.placement || 'hero') === placement)
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)), [banners, placement]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StoreBanner | null>(null);
  const [previewing, setPreviewing] = useState<StoreBanner | null>(null);

  const persistFiles = async (draft: BannerDraft, desktopFile: File | null, mobileFile: File | null) => {
    const purpose = placement === 'hero' ? 'hero-banner' : 'commercial-banner';
    const imageUrl = desktopFile
      ? await uploadCatalogImage(supabase, desktopFile, { companyId, purpose, label: draft.title || draft.altText })
      : draft.imageUrl;
    const mobileImageUrl = mobileFile
      ? await uploadCatalogImage(supabase, mobileFile, { companyId, purpose, label: `${draft.title || draft.altText}-mobile` })
      : draft.mobileImageUrl || null;
    return { imageUrl, mobileImageUrl };
  };

  const create = async (draft: BannerDraft, desktopFile: File | null, mobileFile: File | null) => {
    try {
      const files = await persistFiles(draft, desktopFile, mobileFile);
      addBanner({
        image_url: files.imageUrl,
        mobile_image_url: files.mobileImageUrl,
        title: draft.title.trim() || undefined,
        subtitle: draft.subtitle.trim() || undefined,
        link: draft.link.trim() || undefined,
        alt_text: draft.altText.trim() || null,
        placement,
        active: true,
        sort_order: filtered.length,
        open_in_new_tab: draft.openInNewTab
      });
      setCreating(false);
      notify('Banner adicionado ao catálogo.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível adicionar o banner.');
    }
  };

  const saveEdit = async (draft: BannerDraft, desktopFile: File | null, mobileFile: File | null) => {
    if (!editing) return;
    try {
      const files = await persistFiles(draft, desktopFile, mobileFile);
      updateBanner(editing.id, {
        image_url: files.imageUrl,
        mobile_image_url: files.mobileImageUrl,
        title: draft.title.trim() || undefined,
        subtitle: draft.subtitle.trim() || undefined,
        link: draft.link.trim() || undefined,
        alt_text: draft.altText.trim() || null,
        open_in_new_tab: draft.openInNewTab
      });
      setEditing(null);
      notify('Banner atualizado.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível atualizar o banner.');
    }
  };

  const move = (banner: StoreBanner, direction: -1 | 1) => {
    const index = filtered.findIndex((item) => item.id === banner.id);
    const target = filtered[index + direction];
    if (!target) return;
    updateBanner(banner.id, { sort_order: target.sort_order ?? index + direction });
    updateBanner(target.id, { sort_order: banner.sort_order ?? index });
  };

  const duplicate = (banner: StoreBanner) => {
    addBanner({
      image_url: banner.image_url,
      mobile_image_url: banner.mobile_image_url || null,
      title: `${banner.title || 'Banner'} — cópia`,
      subtitle: banner.subtitle,
      link: banner.link,
      alt_text: banner.alt_text,
      placement,
      active: false,
      sort_order: filtered.length,
      open_in_new_tab: banner.open_in_new_tab === true
    });
    notify('Banner duplicado como inativo para revisão segura.');
  };

  const remove = (banner: StoreBanner) => {
    if (!window.confirm(`Excluir o banner “${banner.title || 'Sem título'}”?`)) return;
    deleteBanner(banner.id);
    notify('Banner excluído.');
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-testid={`catalog-${placement}-banners`}>
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <button type="button" onClick={() => { setCreating(true); setEditing(null); }} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground"><Plus className="h-4 w-4" />Novo banner</button>
      </div>

      {creating && <BannerForm placement={placement} initial={emptyDraft()} submitLabel="Adicionar banner" onSubmit={create} onCancel={() => setCreating(false)} products={products} />}
      {editing && <BannerForm key={editing.id} placement={placement} initial={draftFromBanner(editing)} submitLabel="Salvar alterações" onSubmit={saveEdit} onCancel={() => setEditing(null)} products={products} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((banner, index) => (
          <article key={banner.id} className="overflow-hidden rounded-xl border border-border bg-background" data-testid={`catalog-banner-${banner.id}`}>
            <div className={`relative bg-slate-900 ${placement === 'hero' ? 'aspect-[61/15]' : 'aspect-[3/1]'}`}>
              <Image unoptimized fill sizes="(min-width: 1024px) 50vw, 100vw" src={banner.image_url} alt={banner.alt_text || banner.title || 'Banner do catálogo'} className="object-cover" />
              <span className={`absolute left-3 top-3 rounded-full px-2 py-1 text-[9px] font-black uppercase ${banner.active !== false ? 'bg-emerald-500 text-white' : 'bg-slate-950/75 text-slate-200'}`}>{banner.active !== false ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-foreground">{banner.title || 'Sem título administrativo'}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Ordem {banner.sort_order ?? index} · {banner.link || 'Sem link'}</p>
                </div>
                <button type="button" onClick={() => updateBanner(banner.id, { active: banner.active === false })} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-[10px] font-bold ${banner.active !== false ? 'border-emerald-500/30 text-emerald-600' : 'border-border text-muted-foreground'}`} aria-label={`${banner.active !== false ? 'Desativar' : 'Ativar'} ${banner.title || 'banner'}`}><Power className="h-4 w-4" />{banner.active !== false ? 'Ativo' : 'Inativo'}</button>
              </div>
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
                <button type="button" onClick={() => setPreviewing(banner)} aria-label="Visualizar banner" className="flex min-h-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><Eye className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setEditing(banner); setCreating(false); }} aria-label="Editar banner" className="flex min-h-11 items-center justify-center rounded-lg border border-border text-primary"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => duplicate(banner)} aria-label="Duplicar banner" className="flex min-h-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(banner)} aria-label="Excluir banner" className="flex min-h-11 items-center justify-center rounded-lg border border-rose-500/30 text-rose-500"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(banner, -1)} disabled={index === 0} aria-label="Mover banner para cima" className="flex min-h-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(banner, 1)} disabled={index === filtered.length - 1} aria-label="Mover banner para baixo" className="flex min-h-11 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </div>
            </div>
          </article>
        ))}
        {filtered.length === 0 && <p className="lg:col-span-2 rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">Nenhum banner configurado neste slot.</p>}
      </div>

      {previewing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Preview do banner">
          <div className="w-full max-w-5xl space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-foreground">{previewing.title || 'Preview do banner'}</p><p className="text-[10px] text-muted-foreground">Visualização aproximada do slot público</p></div><button type="button" onClick={() => setPreviewing(null)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border" aria-label="Fechar preview"><X className="h-4 w-4" /></button></div>
            <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${placement === 'hero' ? 'aspect-[61/15]' : 'aspect-[3/1]'}`}><Image unoptimized fill sizes="100vw" src={previewing.image_url} alt={previewing.alt_text || previewing.title || 'Banner'} className="object-cover" /></div>
          </div>
        </div>
      )}
    </section>
  );
}

export function CatalogBannerManager(props: Props) {
  return (
    <div className="space-y-5">
      <BannerList {...props} placement="hero" title="Banner Slider principal" description="Campanhas de maior destaque no topo da loja, com conteúdo sobreposto e imagem mobile opcional." />
      <BannerList {...props} placement="catalog" title="Banners comerciais" description="Campanhas compactas exibidas junto à grade de produtos, sem misturar com o slider principal." />
    </div>
  );
}
