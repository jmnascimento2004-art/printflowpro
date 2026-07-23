export type QuoteDiscountMode = 'fixed' | 'percentage';

export function sanitizePtBrDecimalInput(
  rawValue: unknown,
  options?: { max?: number }
): string | null;
export function parsePtBrDecimal(value: unknown): number;
export function normalizePtBrDecimalOnBlur(value: unknown, options?: { max?: number }): string;
export function calculateQuoteDiscount(grossTotal: number, inputValue: unknown, mode: QuoteDiscountMode): number;
export function calculateQuoteNetTotal(grossTotal: number, inputValue: unknown, mode: QuoteDiscountMode): number;
