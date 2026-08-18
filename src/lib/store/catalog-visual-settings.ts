import type { Company } from '@/lib/dummy-data';

export const CATALOG_BENEFIT_SLOTS = [1, 2, 3, 4, 5, 6, 7] as const;
export type CatalogBenefitSlot = (typeof CATALOG_BENEFIT_SLOTS)[number];

export const CATALOG_BENEFIT_ICON_OPTIONS = [
  { value: 'credit-card', label: 'Cartão' },
  { value: 'percent', label: 'Desconto' },
  { value: 'truck', label: 'Entrega' },
  { value: 'map-pin', label: 'Localização' },
  { value: 'package-check', label: 'Pedido garantido' },
  { value: 'badge-dollar-sign', label: 'Custo-benefício' },
  { value: 'shield-check', label: 'Segurança' },
  { value: 'clock', label: 'Prazo' }
] as const;

export type CatalogBenefitIcon = (typeof CATALOG_BENEFIT_ICON_OPTIONS)[number]['value'];

const BENEFIT_DEFAULTS: Record<CatalogBenefitSlot, {
  title: string;
  subtitle: string;
  active: boolean;
  icon: CatalogBenefitIcon;
}> = {
  1: { title: 'Até 4x Sem Juros', subtitle: 'Parcela mínima conforme as condições da loja.', active: true, icon: 'credit-card' },
  2: { title: 'Desconto no PIX', subtitle: 'Condição especial para pagamentos à vista.', active: true, icon: 'percent' },
  3: { title: 'Frete para todo Brasil', subtitle: 'Envio por transportadoras disponíveis para sua região.', active: true, icon: 'truck' },
  4: { title: 'Pontos de Coleta', subtitle: 'Retire em um dos balcões autorizados.', active: true, icon: 'map-pin' },
  5: { title: 'Entrega Garantida', subtitle: 'Acompanhe seu pedido até a entrega.', active: false, icon: 'package-check' },
  6: { title: 'Melhor Custo Benefício', subtitle: 'Qualidade profissional com preço competitivo.', active: false, icon: 'badge-dollar-sign' },
  7: { title: 'Qualidade Garantida', subtitle: 'Produção revisada e acabamento profissional.', active: false, icon: 'shield-check' }
};

export interface CatalogBenefitCard {
  slot: CatalogBenefitSlot;
  title: string;
  subtitle: string;
  active: boolean;
  icon: CatalogBenefitIcon;
  sortOrder: number;
}

function isSupportedIcon(value: unknown): value is CatalogBenefitIcon {
  return CATALOG_BENEFIT_ICON_OPTIONS.some((option) => option.value === value);
}

export function getCatalogBenefitCards(company: Company): CatalogBenefitCard[] {
  const row = company as Company & Record<string, unknown>;
  return CATALOG_BENEFIT_SLOTS.map((slot) => {
    const fallback = BENEFIT_DEFAULTS[slot];
    const icon = row[`card_benefits_${slot}_icon`];
    const order = Number(row[`card_benefits_${slot}_sort_order`]);
    return {
      slot,
      title: String(row[`card_benefits_${slot}_title`] || fallback.title),
      subtitle: String(row[`card_benefits_${slot}_subtitle`] || fallback.subtitle),
      active: row[`card_benefits_${slot}_active`] === undefined
        ? fallback.active
        : row[`card_benefits_${slot}_active`] !== false,
      icon: isSupportedIcon(icon) ? icon : fallback.icon,
      sortOrder: Number.isInteger(order) && order > 0 ? order : slot
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder || left.slot - right.slot);
}

export function catalogBenefitCardsToCompanyPatch(cards: readonly CatalogBenefitCard[]) {
  const patch: Record<string, string | number | boolean> = {};
  cards.forEach((card, index) => {
    patch[`card_benefits_${card.slot}_title`] = card.title.trim();
    patch[`card_benefits_${card.slot}_subtitle`] = card.subtitle.trim();
    patch[`card_benefits_${card.slot}_active`] = card.active;
    patch[`card_benefits_${card.slot}_icon`] = card.icon;
    patch[`card_benefits_${card.slot}_sort_order`] = index + 1;
  });
  return patch;
}

export function getContrastingTextColor(hex: string) {
  const normalized = String(hex || '').trim().replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((value) => `${value}${value}`).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.56 ? '#0f172a' : '#ffffff';
}
