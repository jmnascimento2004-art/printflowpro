import { resolveProductFields, productFieldsSummary, type ProductFieldValues } from './product-custom-fields';
import type { Customer, Product, QuoteItem } from './dummy-data';
import { resolveProductPrice, type PricingConfig } from './pricing';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (text: string): string[] => normalize(text).replace(/banners/g, 'banner').replace(/cartoes/g, 'cartao').replace(/adesivos/g, 'adesivo').match(/[a-z]{3,}/g) || [];
const stopWords = new Set(['preciso', 'quero', 'com', 'para', 'frente', 'verso', 'unidades', 'metros', 'cliente', 'por', 'favor']);
export type QuoteIntent = {
  text: string; quantity: number; width?: number; height?: number; length?: number;
  candidateIds: string[]; productId: string; confidence: 'Alta' | 'Média' | 'Baixa';
  measureNeedsReview: boolean; warning: string;
};
export function interpretQuoteText(text: string, products: Product[], customers: Customer[]) {
  const bounded = text.trim().slice(0, 4000);
  const clientText = bounded.match(/cliente:\s*([^;\n]+)/i)?.[1]?.trim();
  const matches = clientText ? customers.filter(customer => normalize(customer.name.trim()) === normalize(clientText)) : [];
  const clauses = bounded.replace(/cliente:\s*[^;\n]+[;\n]?/gi, '').split(/\n|;|\s+e\s+(?=\d)/i).map(value => value.trim()).filter(Boolean);
  const items: QuoteIntent[] = clauses.slice(0, 20).map(clause => {
    const measure = clause.match(/(\d+(?:[.,]\d+)?)\s*(cm|m)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|m)?\b/i);
    const number = (value: string) => Number(value.replace(',', '.'));
    const quantityMatch = clause.replace(measure?.[0] || /$^/, '').replace(/\d+(?:[.,]\d+)?\s*(metros?|m)\b/gi, '').match(/(?:^|\s)(\d+)\s+(?:unidades?\s+(?:de\s+)?)?[a-zá-ú]/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const unit = measure?.[4] || measure?.[2];
    const width = measure ? number(measure[1]) / ((measure[2] || unit)?.toLowerCase() === 'cm' ? 100 : 1) : undefined;
    const height = measure ? number(measure[3]) / ((measure[4] || unit)?.toLowerCase() === 'cm' ? 100 : 1) : undefined;
    const linear = !measure ? clause.match(/(\d+(?:[.,]\d+)?)\s*(metros?|m)\b/i) : null;
    const tokens = words(clause).filter(word => !stopWords.has(word));
    const candidates = products.map(product => ({ product, score: tokens.filter(token => words(product.name).includes(token)).length }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
    const top = candidates[0]?.score || 0;
    const candidateIds = candidates.filter(row => row.score === top).map(row => row.product.id);
    const productId = candidateIds.length === 1 ? candidateIds[0] : '';
    const measureNeedsReview = Boolean(measure && !unit && ((width || 0) > 3 || (height || 0) > 3));
    const confidence = !productId || !quantityMatch || measureNeedsReview ? 'Baixa' : candidates[0]?.score > 1 ? 'Alta' : 'Média';
    return { text: clause, quantity, width, height, length: linear ? number(linear[1]) : undefined, candidateIds, productId, confidence, measureNeedsReview,
      warning: !candidateIds.length ? 'Produto não reconhecido. Escolha um produto do cadastro.' : measureNeedsReview ? 'Unidade ambígua. Confirme se as medidas são metros ou centímetros.' : !productId ? 'Há mais de um produto candidato. Selecione o correto.' : 'Revise o produto, a quantidade e a configuração.' };
  });
  return { customerId: matches.length === 1 ? matches[0].id : '', items, unrecognized: items.filter(item => !item.candidateIds.length).map(item => item.text), truncated: text.length > 4000 || clauses.length > 20 };
}

export function buildAssistedQuoteItem(product: Product, config: PricingConfig, notes: string): Omit<QuoteItem, 'id'> {
  const fields = resolveProductFields(product.pricing_details?.configurator_options?.custom_fields, config.customOptions?.fieldValues as ProductFieldValues);
  if (fields.errors.length) throw new Error(fields.errors.join(' '));
  const result = resolveProductPrice(product, config);
  const b = result.breakdown;
  if (!Number.isInteger(Number(config.quantity)) || Number(config.quantity) < 1) throw new Error('Revise a quantidade.');
  if ((b.measureBasis === 'area' && (!(Number(config.width) > 0) || !(Number(config.height) > 0))) || (b.measureBasis === 'length' && !(Number(config.length) > 0))) throw new Error('Informe medidas positivas em metros.');
  if (!result.canPurchase) throw new Error(result.warningMessage || 'Revise a configuração.');
  const row = result.matchedMatrixRow;
  const tier = result.matchedTier || result.selectedQuantityTier;
  const configurationSnapshot = tier ? {
    sale_mode: row ? 'variant_matrix' as const : 'volume' as const,
    material: row?.material, size: row?.size, colors: row?.colors, finishing: row?.finishing,
    quantity_tier: tier.min_qty, unit_price: result.unitPrice, total_price: result.totalPrice,
    display_label: [`${tier.min_qty} un`, row?.material, row?.size, row?.colors, row?.finishing].filter(Boolean).join(' | '),
    matrix_row_id: row?.id, production_time: result.productionTime, production_time_source: result.productionTimeSource
  } : undefined;
  return { product_id: product.id, product_name: product.name, quantity: b.quantity, unit_price: result.unitPrice, total_price: result.totalPrice,
    details: { configuration_summary: productFieldsSummary(fields.snapshot), item_type: 'catalog', pricing_type: product.pricing_type,
      width: b.measureBasis === 'area' ? Number(config.width) : undefined, height: b.measureBasis === 'area' ? Number(config.height) : undefined,
      length: b.measureBasis === 'length' ? b.length : undefined, notes, selected_options: result.selectedOptionsSnapshot,
      production_time: result.productionTime, production_time_source: result.productionTimeSource,
      configuration_snapshot: configurationSnapshot,
      pricing_snapshot: { custom_fields: fields.snapshot, dimension_unit: 'm', quantity: b.quantity, area: b.area, billable_area: b.billableArea, minimum_area: b.minimumArea, length: b.length, measure_basis: b.measureBasis, base_unit_price: b.unitPrice, unit_price_basis: 'piece', unit_price: result.unitPrice, total_price: result.totalPrice, pricing_config: structuredClone(config), pricing_result: structuredClone(result) }
    }
  };
}
