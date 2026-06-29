import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, ProductGalleryImage } from '@/lib/dummy-data';

export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_PRODUCT_GALLERY_IMAGES = 3;
export const MAX_PRODUCT_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_PRODUCT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const isValidImage = (image: ProductGalleryImage | null | undefined): image is ProductGalleryImage => {
  return typeof image?.url === 'string' && image.url.trim().length > 0;
};

const slugifyPathSegment = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'produto';
};

const getImageExtension = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return extension;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

export function isDataImageUrl(url: string) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(url.trim());
}

export function validateProductGalleryLimit(currentCount: number, incomingCount: number) {
  if (currentCount + incomingCount <= MAX_PRODUCT_GALLERY_IMAGES) {
    return { valid: true as const };
  }

  return {
    valid: false as const,
    message: `Limite de ${MAX_PRODUCT_GALLERY_IMAGES} imagens por produto.`
  };
}

export function validateProductImage(file: File) {
  if (!ACCEPTED_PRODUCT_IMAGE_TYPES.has(file.type)) {
    return { valid: false as const, message: 'Use apenas imagens PNG, JPG ou WEBP.' };
  }

  if (file.size > MAX_PRODUCT_IMAGE_SIZE_BYTES) {
    return { valid: false as const, message: 'Uma das imagens e muito grande. Escolha arquivos de ate 2MB.' };
  }

  return { valid: true as const };
}

export async function uploadProductImage(
  supabaseClient: SupabaseClient,
  file: File,
  options: {
    companyId?: string | null;
    productId?: string | null;
    productName?: string | null;
  } = {}
) {
  const validation = validateProductImage(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const companyPath = slugifyPathSegment(options.companyId || 'sem-empresa');
  const productPath = slugifyPathSegment(options.productId || 'temp');
  const baseName = slugifyPathSegment(options.productName || file.name.replace(/\.[^.]+$/, ''));
  const extension = getImageExtension(file);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${companyPath}/products/${productPath}/${baseName}-${uniqueSuffix}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(`Nao foi possivel enviar a imagem para o bucket ${PRODUCT_IMAGE_BUCKET}: ${error.message}`);
  }

  const { data } = supabaseClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new Error('Nao foi possivel gerar a URL publica da imagem enviada.');
  }

  return data.publicUrl;
}

export function normalizeProductGallery(product: Pick<Product, 'image_url' | 'name' | 'pricing_details'>): ProductGalleryImage[] {
  const savedGallery = product.pricing_details?.gallery_images || [];
  const uniqueUrls = new Set<string>();
  const normalized = savedGallery
    .filter(isValidImage)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .reduce<ProductGalleryImage[]>((images, image) => {
      const url = image.url.trim();
      if (uniqueUrls.has(url)) return images;
      uniqueUrls.add(url);
      images.push({
        url,
        alt: image.alt || product.name,
        is_primary: image.is_primary,
        position: images.length
      });
      return images;
    }, []);

  if (product.image_url?.trim() && !uniqueUrls.has(product.image_url.trim())) {
    normalized.unshift({
      url: product.image_url.trim(),
      alt: product.name,
      is_primary: normalized.length === 0,
      position: 0
    });
  }

  if (normalized.length === 0) return [];

  const primaryIndex = normalized.findIndex((image) => image.is_primary);
  return normalized.map((image, index) => ({
    ...image,
    alt: image.alt || product.name,
    is_primary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
    position: index
  }));
}

export function getPrimaryProductImage(product: Pick<Product, 'image_url' | 'name' | 'pricing_details'>): string {
  return normalizeProductGallery(product).find((image) => image.is_primary)?.url || product.image_url || '';
}

export function prepareProductGallery(images: ProductGalleryImage[], fallbackAlt: string): ProductGalleryImage[] {
  const uniqueUrls = new Set<string>();
  const cleanImages = images
    .filter(isValidImage)
    .reduce<ProductGalleryImage[]>((gallery, image) => {
      const url = image.url.trim();
      if (uniqueUrls.has(url)) return gallery;
      uniqueUrls.add(url);
      gallery.push({
        url,
        alt: image.alt || fallbackAlt,
        is_primary: image.is_primary,
        position: gallery.length
      });
      return gallery;
    }, []);

  const primaryIndex = cleanImages.findIndex((image) => image.is_primary);
  return cleanImages.map((image, index) => ({
    ...image,
    alt: image.alt || fallbackAlt,
    is_primary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
    position: index
  }));
}
