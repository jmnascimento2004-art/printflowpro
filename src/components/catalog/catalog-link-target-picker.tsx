'use client';

import { useEffect,useMemo, useState } from 'react';
import type { Product, Category } from '@/lib/dummy-data';
import { getProductSlugFromStorePath, getPublicProductPath } from '@/lib/store/product-permalink';

type DestinationType = 'none' | 'product' | 'category' | 'url' | 'whatsapp';

interface Props {
  categories?: Category[];
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary';

function inferType(value: string): DestinationType {
  if (!value.trim()) return 'none';
  if (/^\/store\?category=/.test(value.trim())) return 'category';
  if (getProductSlugFromStorePath(value.trim())) return 'product';
  if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(value.trim())) return 'whatsapp';
  return 'url';
}

export function CatalogLinkTargetPicker({ products, categories = [], value, onChange, label = 'Destino' }: Props) {
  const [type, setType] = useState<DestinationType>(() => inferType(value));
  const [search, setSearch] = useState('');
  const selectedSlug = getProductSlugFromStorePath(value);
  const selectedCategory=value.startsWith('/store?')?new URLSearchParams(value.slice('/store?'.length)).get('category')||'':'';
  useEffect(()=>{if(value)setType(inferType(value));},[value]);
  const availableProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return products
      .filter((product) => product.active !== false && product.catalog_active !== false && product.slug)
      .filter((product) => !query || `${product.name} ${product.sku}`.toLocaleLowerCase('pt-BR').includes(query))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [products, search]);

  const changeType = (next: DestinationType) => {
    setType(next);
    if (next === 'none') onChange('');
    else if (next === 'product' && !selectedSlug) onChange('');
    else if (next !== inferType(value)) onChange('');
  };

  return (
    <fieldset className="space-y-2" data-testid="catalog-link-target-picker">
      <legend className="text-[10px] font-bold uppercase text-muted-foreground">{label}</legend>
      <select value={type} onChange={(event) => changeType(event.target.value as DestinationType)} className={fieldClass} aria-label={`${label}: tipo`}>
        <option value="none">Sem destino</option>
        <option value="product">Produto do catálogo</option>
        {(categories.length>0||type==='category')&&<option value="category">Categoria do catálogo</option>}
        <option value="url">URL</option>
        <option value="whatsapp">WhatsApp</option>
      </select>

      {type === 'category' && <select className={fieldClass} aria-label="Categoria de destino" value={selectedCategory} onChange={event=>onChange(event.target.value?`/store?category=${encodeURIComponent(event.target.value)}`:'')}><option value="">Selecione uma categoria</option>{categories.filter(c=>c.show_in_catalog!==false).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}

      {type === 'product' && (
        <div className="space-y-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={fieldClass} placeholder="Buscar por produto ou SKU" aria-label="Buscar produto de destino" />
          <select
            value={selectedSlug || ''}
            onChange={(event) => onChange(getPublicProductPath(event.target.value) || '')}
            className={fieldClass}
            aria-label="Produto de destino"
          >
            <option value="">Selecione um produto publicável</option>
            {availableProducts.map((product) => <option key={product.id} value={product.slug}>{product.name} · {product.sku}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground">Usa o permalink canônico e abre o mesmo configurador público do produto.</p>
        </div>
      )}

      {type === 'url' && <input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} placeholder="https://exemplo.com/campanha" aria-label="URL de destino" />}
      {type === 'whatsapp' && <input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} placeholder="https://wa.me/5571999999999" aria-label="Link do WhatsApp" />}
    </fieldset>
  );
}
