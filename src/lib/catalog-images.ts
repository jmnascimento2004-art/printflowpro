import type { SupabaseClient } from '@supabase/supabase-js';
import { PRODUCT_IMAGE_BUCKET, validateProductImage } from '@/lib/product-images';

const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'catalogo';

const extensionFor = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return extension;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

export async function uploadCatalogImage(
  supabaseClient: SupabaseClient,
  file: File,
  options: { companyId: string; purpose: 'commercial-banner' | 'mega-menu'; label?: string }
) {
  const validation = validateProductImage(file);
  if (!validation.valid) throw new Error(validation.message);

  const path = [
    slugify(options.companyId),
    'catalog',
    options.purpose,
    `${slugify(options.label || file.name.replace(/\.[^.]+$/, ''))}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`
  ].join('/');

  const { error } = await supabaseClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });

  if (error) throw new Error(`Não foi possível enviar a imagem do catálogo: ${error.message}`);

  const { data } = supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Não foi possível gerar a URL pública da imagem do catálogo.');
  return data.publicUrl;
}
