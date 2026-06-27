import type { AdditionalService, Company, Customer, OrderItem, QuoteItem } from '@/lib/dummy-data';

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

export function formatPdfDate(value?: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return date.toLocaleDateString('pt-BR');
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

  return {
    name: normalizePdfText(item.product_name),
    configuration: options ? `Configuração: ${options}` : '',
    quantityLine: `Tiragem: ${tierQuantity} un • Unitário: ${formatPdfUnitCurrency(unitPrice)}/un • Total: ${formatPdfCurrency(totalPrice)}`,
    notes: normalizePdfText(item.details?.notes)
  };
}

export function getAdditionalServicesTotal(services?: AdditionalService[] | null) {
  return (services || []).reduce((sum, service) => sum + Number(service.total_price || 0), 0);
}
