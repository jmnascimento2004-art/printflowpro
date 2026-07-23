import type { OrderItem, QuoteItem } from '@/lib/dummy-data';

export type PdfItemViewModel = {
  quantity: number;
  description: string;
  size: string;
  unitPrice: number;
  totalPrice: number;
};

export function cleanLegacyGeneratedDescription(value: unknown): string;
export function formatPdfItemSizeValue(item: QuoteItem | OrderItem): string;
export function buildPdfItemViewModel(item: QuoteItem | OrderItem): PdfItemViewModel;
