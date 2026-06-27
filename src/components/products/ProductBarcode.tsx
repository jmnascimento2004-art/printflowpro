import { getCode128Bars } from '@/lib/barcode';

type ProductBarcodeProps = {
  value?: string | null;
  fallback?: string | null;
  height?: number;
  className?: string;
  showText?: boolean;
};

export function ProductBarcode({
  value,
  fallback,
  height = 34,
  className = '',
  showText = true
}: ProductBarcodeProps) {
  const barcode = getCode128Bars(value, fallback);
  const textHeight = showText ? 10 : 0;
  const totalHeight = height + textHeight;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${barcode.modules} ${totalHeight}`}
      role="img"
      aria-label={`Código de barras ${barcode.text}`}
      preserveAspectRatio="none"
    >
      <rect width={barcode.modules} height={totalHeight} fill="#ffffff" />
      {barcode.bars.map((bar, index) => (
        <rect key={`${bar.x}-${bar.width}-${index}`} x={bar.x} y="0" width={bar.width} height={height} fill="#111827" />
      ))}
      {showText && (
        <text
          x={barcode.modules / 2}
          y={height + 8}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontSize="7"
          fill="#475569"
        >
          {barcode.text}
        </text>
      )}
    </svg>
  );
}
