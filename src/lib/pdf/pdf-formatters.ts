import type { AdditionalService, Company, Customer, OrderItem, QuoteItem } from '@/lib/dummy-data';
import type { PdfSettings } from '@/lib/pdf/pdf-data';

export function formatPdfCurrency(value?: number | string | null, options?: { maximumFractionDigits?: number }) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatPdfUnitCurrency(value?: number | string | null) {
  return formatPdfCurrency(value, { maximumFractionDigits: 4 });
}

function parsePdfDate(value?: string | null) {
  if (!value) return new Date(Number.NaN);
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
}

function startOfPdfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatPdfDate(value?: string | null) {
  if (!value) return 'Não informado';
  const date = parsePdfDate(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return date.toLocaleDateString('pt-BR');
}

export function formatQuoteValidityPdfDate(validUntil?: string | null, createdAt?: string | null) {
  const validityDate = parsePdfDate(validUntil);
  if (Number.isNaN(validityDate.getTime())) return formatPdfDate(validUntil);

  const issueDate = parsePdfDate(createdAt);
  if (!Number.isNaN(issueDate.getTime()) && startOfPdfDate(validityDate).getTime() < startOfPdfDate(issueDate).getTime()) {
    return issueDate.toLocaleDateString('pt-BR');
  }

  return validityDate.toLocaleDateString('pt-BR');
}

export function buildCompanyAddress(company?: Company | null) {
  if (!company) return '';
  return [
    company.street && company.number ? `${company.street}, ${company.number}` : company.street,
    company.neighborhood,
    [company.city, company.state].filter(Boolean).join(' - '),
    company.cep ? `CEP ${company.cep}` : ''
  ].filter(Boolean).join(' | ');
}

function hasPhysicalCompanyAddress(company?: Company | null) {
  if (!company) return false;

  const hasStreet = Boolean(company.street?.trim());
  const hasNumber = Boolean(company.number?.trim());
  const hasCity = Boolean(company.city?.trim());
  const hasState = Boolean(company.state?.trim());

  return hasStreet && hasNumber && hasCity && hasState;
}

export function buildVisibleCompanyAddress(company?: Company | null, settings?: PdfSettings | null) {
  if (settings?.footer_show_address === false) return '';

  if (hasPhysicalCompanyAddress(company)) {
    return buildCompanyAddress(company);
  }

  return normalizePdfText(settings?.company_address);
}

export function buildCustomerAddress(customer?: Customer | null, fallbackAddress?: string | null) {
  if (fallbackAddress?.trim()) return fallbackAddress.trim();
  if (!customer?.address) return '';
  return [
    customer.address.street && customer.address.number ? `${customer.address.street}, ${customer.address.number}` : customer.address.street,
    customer.address.complement,
    customer.address.neighborhood,
    [customer.address.city, customer.address.state].filter(Boolean).join(' - '),
    customer.address.zip_code ? `CEP ${customer.address.zip_code}` : ''
  ].filter(Boolean).join(' | ');
}

export function normalizePdfText(value?: string | number | null) {
  return String(value ?? '')
    .replace(/\bnull\b/gi, '')
    .replace(/\bundefined\b/gi, '')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPdfLogoUrl(company?: Company | null) {
  const logo = company?.logo_light || company?.logo_url || company?.logo_dark || '';
  if (/^(https?:|data:image\/)/i.test(logo)) return logo;
  return '';
}

export function getPdfSafeFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'documento';
}

function getSnapshotValue(snapshot: Record<string, unknown> | undefined, key: string) {
  return snapshot?.[key];
}

function getSnapshotNumber(snapshot: Record<string, unknown> | undefined, key: string) {
  const value = getSnapshotValue(snapshot, key);
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getSnapshotText(snapshot: Record<string, unknown> | undefined, key: string) {
  const value = getSnapshotValue(snapshot, key);
  return typeof value === 'string' ? normalizePdfText(value) : '';
}

function formatPdfDecimal(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numeric);
}

function getItemBaseDescription(item: QuoteItem | OrderItem) {
  const snapshot = item.details?.pricing_snapshot;
  const manualDescription = item.details?.item_type === 'manual'
    ? getSnapshotText(snapshot, 'description')
    : '';

  return manualDescription || normalizePdfText(item.product_name);
}

function getItemPricingType(item: QuoteItem | OrderItem) {
  const snapshot = item.details?.pricing_snapshot;
  const snapshotType = getSnapshotText(snapshot, 'pricing_type');
  return item.details?.manual_pricing_type || snapshotType || item.details?.pricing_type || '';
}

function descriptionAlreadyIncludesMeasures(value: string) {
  return /\d+(?:[,.]\d+)?\s*(?:m²|m2|m|un)\b/i.test(value);
}

export function formatQuoteItemDescription(item: QuoteItem | OrderItem) {
  const details = item.details;
  const snapshot = details?.pricing_snapshot;
  const baseDescription = getItemBaseDescription(item);
  if (!details) return baseDescription;
  if (details.item_type === 'manual' && !getSnapshotText(snapshot, 'description') && descriptionAlreadyIncludesMeasures(baseDescription)) {
    return baseDescription;
  }

  const pricingType = getItemPricingType(item);
  const width = details.width ?? getSnapshotNumber(snapshot, 'width');
  const height = details.height ?? getSnapshotNumber(snapshot, 'height');
  const length = details.length ?? details.linear_meters ?? getSnapshotNumber(snapshot, 'linear_meters');
  const quantity = Number(item.quantity || getSnapshotNumber(snapshot, 'quantity') || 0);
  const areaTotal = details.area_total ?? getSnapshotNumber(snapshot, 'area_total');
  const hasPositiveQuantity = Number.isFinite(quantity) && quantity > 0;

  if ((pricingType === 'm2' || (width && height)) && width && height) {
    const totalArea = areaTotal ?? (hasPositiveQuantity ? width * height * quantity : undefined);
    const parts = [
      `${formatPdfDecimal(width)}m x ${formatPdfDecimal(height)}m`,
      hasPositiveQuantity ? `${quantity} un` : '',
      totalArea ? `${formatPdfDecimal(totalArea)} m²` : ''
    ].filter(Boolean);

    return parts.length > 0 ? `${baseDescription} - ${parts.join(' - ')}` : baseDescription;
  }

  if ((pricingType === 'linear' || length) && length) {
    const totalLength = hasPositiveQuantity ? length * quantity : undefined;
    const parts = [
      `${formatPdfDecimal(length)} m linear`,
      hasPositiveQuantity ? `${quantity} un` : '',
      totalLength ? `${formatPdfDecimal(totalLength)} m` : ''
    ].filter(Boolean);

    return parts.length > 0 ? `${baseDescription} - ${parts.join(' - ')}` : baseDescription;
  }

  if (['unidade', 'volume'].includes(pricingType) && hasPositiveQuantity) {
    return `${baseDescription} - ${quantity} un`;
  }

  const tierQuantity = item.details?.configuration_snapshot?.quantity_tier;
  if (item.details?.configuration_snapshot?.sale_mode === 'volume' && tierQuantity) {
    return `${baseDescription} - ${tierQuantity} un`;
  }

  return baseDescription;
}

export function getItemDescriptionLines(item: QuoteItem | OrderItem) {
  const snapshot = item.details?.configuration_snapshot;
  const optionParts = snapshot
    ? [snapshot.material, snapshot.size, snapshot.colors, snapshot.finishing].filter(Boolean)
    : [];

  const fallbackParts = [
    item.details?.configuration_summary,
    item.details?.variant,
    item.details?.color,
    item.details?.width && item.details?.height ? `${item.details.width}x${item.details.height}` : '',
    item.details?.length ? `${item.details.length}m` : ''
  ].filter(Boolean);

  const options = optionParts.length > 0 ? optionParts.join(' • ') : fallbackParts.join(' • ');
  const tierQuantity = snapshot?.quantity_tier || item.quantity;
  const unitPrice = snapshot?.unit_price ?? item.unit_price;
  const totalPrice = snapshot?.total_price ?? item.total_price;
  const manualType = item.details?.manual_pricing_type;
  const unitLabel = manualType === 'm2'
    ? 'Preço m²'
    : manualType === 'linear'
      ? 'Preço metro'
      : 'Unitário';
  const quantityLabel = manualType === 'm2' && item.details?.area_total
    ? `Área total: ${item.details.area_total} m²`
    : manualType === 'linear' && item.details?.linear_meters
      ? `Metragem: ${item.details.linear_meters} m x ${item.quantity} un`
      : `Tiragem: ${tierQuantity} un`;

  return {
    name: normalizePdfText(item.product_name),
    configuration: options ? `Configuração: ${options}` : '',
    quantityLine: `${quantityLabel} • ${unitLabel}: ${formatPdfUnitCurrency(unitPrice)} • Total: ${formatPdfCurrency(totalPrice)}`,
    notes: normalizePdfText(item.details?.notes)
  };
}

export function getCompactItemDescription(item: QuoteItem | OrderItem) {
  return normalizePdfText(item.product_name);
}

export function getPdfFooterText(company?: Company | null) {
  const companyName = normalizePdfText(company?.name) || 'Empresa';
  return `Documento gerado por ${companyName} via PrintFlowPRO.`;
}

export function getAdditionalServicesTotal(services?: AdditionalService[] | null) {
  return (services || []).reduce((sum, service) => sum + Number(service.total_price || 0), 0);
}
