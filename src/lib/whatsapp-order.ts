import type { Product, ProductSaleMode } from '@/lib/dummy-data';
import type { PricingSelectedOption } from '@/lib/pricing';
import { formatCurrency } from '@/lib/pricing';
import { normalizeWhatsAppPhone, openWhatsAppUrl } from '@/lib/whatsapp';

type WhatsAppSelectedOption = PricingSelectedOption & {
  group_name?: string;
};

export interface BuildWhatsAppOrderMessageInput {
  companyName?: string;
  productName: string;
  saleType?: string;
  pricingType?: Product['pricing_type'] | ProductSaleMode;
  quantity: number;
  dimensions?: {
    width?: number;
    height?: number;
    length?: number;
  };
  selectedOptions?: WhatsAppSelectedOption[];
  productionDays?: number;
  estimatedDeadline?: string;
  subtotal: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

const saleTypeLabels: Partial<Record<Product['pricing_type'] | ProductSaleMode, string>> = {
  unidade: 'Unidade',
  volume: 'Preco por quantidade',
  m2: 'Metro quadrado',
  linear: 'Metro linear',
  width_height: 'Largura x Altura',
  pacote: 'Pacote / Kit',
  kit: 'Pacote / Kit',
  size_grid: 'Grade de tamanhos',
  custom: 'Produto personalizado'
};

const formatMeters = (value?: number) => {
  if (!value) return '';
  return `${(Number(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}cm`;
};

const formatOptions = (options: WhatsAppSelectedOption[] = []) => {
  if (options.length === 0) return '';

  return options
    .map((option) => {
      const label = option.name || option.option_name;
      return option.group_name ? `${option.group_name}: ${label}` : label;
    })
    .filter(Boolean)
    .join(' | ');
};

export const buildWhatsAppOrderMessage = ({
  companyName,
  productName,
  saleType,
  pricingType,
  quantity,
  dimensions,
  selectedOptions = [],
  productionDays = 0,
  estimatedDeadline,
  subtotal,
  customerName,
  customerPhone,
  notes
}: BuildWhatsAppOrderMessageInput) => {
  const resolvedSaleType = saleType || (pricingType ? saleTypeLabels[pricingType] : undefined) || 'Produto';
  const dimensionsText = dimensions?.width && dimensions?.height
    ? `${formatMeters(dimensions.width)} x ${formatMeters(dimensions.height)}`
    : '';
  const lengthText = dimensions?.length ? formatMeters(dimensions.length) : '';
  const optionsText = formatOptions(selectedOptions);
  const deadlineParts = [
    estimatedDeadline?.trim(),
    productionDays > 0 ? `+ ${productionDays} dia(s)` : ''
  ].filter(Boolean);

  const lines = [
    'Ola! Gostaria de solicitar este produto:',
    '',
    companyName ? `Empresa: ${companyName}` : null,
    `Produto: ${productName}`,
    `Tipo: ${resolvedSaleType}`,
    `Quantidade: ${quantity}`,
    dimensionsText ? `Medidas: ${dimensionsText}` : null,
    lengthText ? `Metragem: ${lengthText}` : null,
    optionsText ? `Opcoes: ${optionsText}` : null,
    deadlineParts.length > 0 ? `Prazo: ${deadlineParts.join(' ')}` : null,
    `Total estimado: ${formatCurrency(subtotal)}`,
    customerName?.trim() ? `Cliente: ${customerName.trim()}` : null,
    customerPhone?.trim() ? `Telefone: ${customerPhone.trim()}` : null,
    notes?.trim() ? `Observacoes: ${notes.trim()}` : null,
    '',
    'Aguardo atendimento.'
  ];

  return lines.filter((line) => line !== null).join('\n');
};

export const normalizeBrazilWhatsAppPhone = (phone: string) => {
  return normalizeWhatsAppPhone(phone);
};

export const openWhatsAppWithMessage = (phone: string, message: string) => {
  return openWhatsAppUrl(phone, message);
};
