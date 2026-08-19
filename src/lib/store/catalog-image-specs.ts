import { MAX_PRODUCT_IMAGE_SIZE_BYTES } from '@/lib/product-images';

export type CatalogImageSpecKey =
  | 'heroDesktop'
  | 'heroMobile'
  | 'commercialDesktop'
  | 'commercialMobile'
  | 'megaMenu';

export interface CatalogImageSpec {
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  aspectRatio: string;
  acceptedFormats: string;
  maxFileSizeBytes: number;
  objectFit: 'cover';
  source: string;
}

export const CATALOG_IMAGE_SPECS: Record<CatalogImageSpecKey, CatalogImageSpec> = {
  heroDesktop: {
    label: 'Slider principal — desktop',
    recommendedWidth: 1220,
    recommendedHeight: 300,
    aspectRatio: '61:15',
    acceptedFormats: 'JPG, PNG ou WebP',
    maxFileSizeBytes: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    objectFit: 'cover',
    source: 'Slot real da Store: max-w-[1220px] e h-[300px] no desktop.'
  },
  heroMobile: {
    label: 'Slider principal — mobile',
    recommendedWidth: 720,
    recommendedHeight: 360,
    aspectRatio: '2:1',
    acceptedFormats: 'JPG, PNG ou WebP',
    maxFileSizeBytes: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    objectFit: 'cover',
    source: 'Slot real da Store: largura útil móvel e h-[180px].'
  },
  commercialDesktop: {
    label: 'Banner comercial — desktop',
    recommendedWidth: 900,
    recommendedHeight: 300,
    aspectRatio: '3:1',
    acceptedFormats: 'JPG, PNG ou WebP',
    maxFileSizeBytes: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    objectFit: 'cover',
    source: 'Slot real da Store: aspect-[3/1].'
  },
  commercialMobile: {
    label: 'Banner comercial — mobile',
    recommendedWidth: 900,
    recommendedHeight: 300,
    aspectRatio: '3:1',
    acceptedFormats: 'JPG, PNG ou WebP',
    maxFileSizeBytes: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    objectFit: 'cover',
    source: 'Slot móvel real da Store: aspect-[3/1].'
  },
  megaMenu: {
    label: 'Banner do Mega Menu',
    recommendedWidth: 600,
    recommendedHeight: 640,
    aspectRatio: '15:16',
    acceptedFormats: 'JPG, PNG ou WebP',
    maxFileSizeBytes: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    objectFit: 'cover',
    source: 'Slot real do Mega Menu: coluna de 240px, max-h-64 e imagem 600×640.'
  }
};

export const formatCatalogImageMaxSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
