import { uploadManagedImage } from '@/lib/media-upload-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, ProductGalleryImage } from '@/lib/dummy-data';

export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_PRODUCT_GALLERY_IMAGES = 3;
export const MAX_PRODUCT_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_PRODUCT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const isValidImage = (image: ProductGalleryImage | null | undefined): image is ProductGalleryImage => {
  return typeof image?.url === 'string' && image.url.trim().length > 0;
};

export function isDataImageUrl(url: string) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(url.trim());
}

export function isStorageProductImageUrl(url: string) {
  const cleanUrl = url.trim();
  return cleanUrl.includes('/storage/v1/object/public/product-images/');
}

const getPreferredPrimaryIndex = (images: ProductGalleryImage[]) => Math.max(0, images.findIndex(image => image.is_primary));

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

export async function uploadProductImage(client: SupabaseClient,file:File,options:{companyId?:string|null;productId?:string|null;productName?:string|null}={}) {
 const validation=validateProductImage(file);if(!validation.valid)throw new Error(validation.message);
 return (await uploadManagedImage(client,file,'products',options.productId||'draft')).url;
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

  const primaryIndex = getPreferredPrimaryIndex(normalized);
  return normalized.map((image, index) => ({
    ...image,
    alt: image.alt || product.name,
    is_primary: index === primaryIndex,
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

  const limitedImages = cleanImages.slice(0, MAX_PRODUCT_GALLERY_IMAGES);

  const primaryIndex = getPreferredPrimaryIndex(limitedImages);
  return limitedImages.map((image, index) => ({
    ...image,
    alt: image.alt || fallbackAlt,
    is_primary: index === primaryIndex,
    position: index
  }));
}
