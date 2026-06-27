import { ProductBarcode } from './ProductBarcode';

export type ProductLabelSize = 'small' | 'medium' | 'large';

type ProductLabelPreviewProps = {
  product: {
    id: string;
    name: string;
    sku?: string;
    sales_price: number;
  };
  categoryName?: string;
  saleModeLabel?: string;
  companyLogoUrl?: string | null;
  size: ProductLabelSize;
  showPrice: boolean;
  showLogo: boolean;
  showCategory: boolean;
  formatCurrency: (value: number) => string;
};

const LABEL_SIZES: Record<ProductLabelSize, { width: number; height: number; label: string }> = {
  small: { width: 50, height: 30, label: 'Pequena 50 x 30mm' },
  medium: { width: 70, height: 40, label: 'Média 70 x 40mm' },
  large: { width: 100, height: 50, label: 'Grande 100 x 50mm' }
};

export const productLabelSizes = LABEL_SIZES;

export function ProductLabelPreview({
  product,
  categoryName,
  saleModeLabel,
  companyLogoUrl,
  size,
  showPrice,
  showLogo,
  showCategory,
  formatCurrency
}: ProductLabelPreviewProps) {
  const labelSize = LABEL_SIZES[size];
  const productCode = product.sku || product.id;
  const showMeta = showCategory && (categoryName || saleModeLabel);

  return (
    <div
      className="product-label-preview break-inside-avoid overflow-hidden border border-slate-300 bg-white text-slate-950 shadow-sm"
      style={{
        width: `${labelSize.width}mm`,
        minHeight: `${labelSize.height}mm`,
        padding: size === 'small' ? '2mm' : '3mm'
      }}
    >
      <div className="flex h-full flex-col gap-1">
        {showLogo && companyLogoUrl && (
          <div className="flex justify-center">
            <div
              role="img"
              aria-label="Logo da empresa"
              className="h-5 w-[70%] bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${companyLogoUrl}")` }}
            />
          </div>
        )}

        <div className="min-h-0 text-center">
          <p className="line-clamp-2 text-[9px] font-black leading-tight text-slate-950">{product.name}</p>
          {showMeta && (
            <p className="mt-0.5 truncate text-[7px] font-semibold text-slate-500">
              {[categoryName, saleModeLabel].filter(Boolean).join(' • ')}
            </p>
          )}
          {showPrice && product.sales_price > 0 && (
            <p className="mt-0.5 text-[10px] font-black text-slate-950">{formatCurrency(product.sales_price)}</p>
          )}
        </div>

        <ProductBarcode value={product.sku} fallback={product.id} height={size === 'small' ? 22 : 28} className="h-8 w-full" showText={false} />
        <p className="truncate text-center font-mono text-[7px] font-semibold tracking-tight text-slate-600">SKU: {productCode}</p>
      </div>
    </div>
  );
}
