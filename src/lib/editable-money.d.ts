export function parsePtBrMoneyInput(value: number | string | null | undefined): number;
export type PtBrMoneyDraftState = {
  raw: string;
  value: number | null;
  valid: boolean;
  empty: boolean;
};
export type PtBrMoneyTierDraft = {
  draftId?: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  productionTime?: string;
  unitPriceValid?: boolean;
  totalPriceValid?: boolean;
};
export type PtBrMoneyTierError = {
  draftId: string;
  quantity: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
};
export function parsePtBrMoneyDraft(value: string | null | undefined, maximumFractionDigits?: number): PtBrMoneyDraftState;
export function sanitizePtBrMoneyInput(value: string, maximumFractionDigits?: number): string;
export function formatPtBrMoneyInput(value: number | null | undefined, maximumFractionDigits?: number): string;
export function normalizePtBrMoneyInput(value: string | null | undefined, maximumFractionDigits?: number): string;
export function serializePtBrMoneyTierDrafts(drafts: PtBrMoneyTierDraft[]): {
  valid: boolean;
  saveAllowed: boolean;
  serializationAllowed: boolean;
  silentTierDrop: false;
  drafts: PtBrMoneyTierDraft[];
  tiers: Array<{ quantity: number; unit_price: number; total_price: number; production_time?: string }> | null;
  errors: PtBrMoneyTierError[];
};
