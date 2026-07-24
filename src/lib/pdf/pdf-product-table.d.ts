import type { ReactElement } from 'react';
import type { OrderItem, QuoteItem } from '@/lib/dummy-data';

export const PDF_PRODUCT_COLUMN_WIDTHS: Readonly<{
  quantity: '8%';
  description: '46%';
  size: '16%';
  unit: '15%';
  total: '15%';
}>;

export function PdfProductTable(props: { items: Array<QuoteItem | OrderItem> }): ReactElement;
