import type { Product, ProductGalleryImage } from '@/lib/dummy-data';

const isValidImage = (image: ProductGalleryImage | null | undefined): image is ProductGalleryImage => {
  return typeof image?.url === 'string' && image.url.trim().length > 0;
};

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
