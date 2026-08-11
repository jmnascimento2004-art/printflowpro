const PLAIN_INTEGER_PATTERN = /^\d+$/;
const GROUPED_INTEGER_PATTERN = /^[1-9]\d{0,2}(?:\.\d{3})+$/;

function parsePtBrUserText(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '');

  if (!raw) return null;

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  if (!unsigned || unsigned.includes('-') || (unsigned.match(/,/g) || []).length > 1) return null;

  const [integerText, decimalText] = unsigned.split(',');
  const validInteger = PLAIN_INTEGER_PATTERN.test(integerText) || GROUPED_INTEGER_PATTERN.test(integerText);
  const validLeadingDecimal = integerText === '' && typeof decimalText === 'string' && decimalText.length > 0;
  if ((!validInteger && !validLeadingDecimal) || (decimalText !== undefined && !/^\d*$/.test(decimalText))) return null;

  const integerDigits = integerText.replace(/\./g, '') || '0';
  const canonicalText = `${negative ? '-' : ''}${integerDigits}${decimalText === undefined ? '' : `.${decimalText}`}`;
  const parsed = Number(canonicalText);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePtBrMoneyDraft(value, maximumFractionDigits = 4) {
  const raw = String(value ?? '');
  const normalized = raw
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '');

  if (!normalized) {
    return { raw, value: null, valid: false, empty: true };
  }

  const parsed = parsePtBrUserText(raw);
  const commaIndex = normalized.indexOf(',');
  const fractionDigits = commaIndex >= 0 ? normalized.slice(commaIndex + 1).length : 0;
  const valid = parsed !== null && fractionDigits <= Math.max(0, maximumFractionDigits);

  return {
    raw,
    value: valid ? parsed : null,
    valid,
    empty: false
  };
}

export function parsePtBrMoneyInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return parsePtBrUserText(value) ?? 0;
}

export function sanitizePtBrMoneyInput(value, maximumFractionDigits = 4) {
  const cleaned = String(value ?? '').replace(/[^\d,.]/g, '');
  if (!cleaned) return '';

  const commaCount = (cleaned.match(/,/g) || []).length;
  if (commaCount > 1) return '';

  if (commaCount === 0) {
    if (PLAIN_INTEGER_PATTERN.test(cleaned) || GROUPED_INTEGER_PATTERN.test(cleaned)) return cleaned;
    return '';
  }

  const [integerText, decimalText = ''] = cleaned.split(',');
  const validInteger = PLAIN_INTEGER_PATTERN.test(integerText) || GROUPED_INTEGER_PATTERN.test(integerText);
  if (!validInteger || decimalText.includes('.')) return '';

  const integerDigits = integerText.replace(/\./g, '');
  return `${integerDigits},${decimalText.slice(0, Math.max(0, maximumFractionDigits))}`;
}

export function formatPtBrMoneyInput(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) return '';

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, maximumFractionDigits),
    useGrouping: true
  }).format(value);
}

export function normalizePtBrMoneyInput(value, maximumFractionDigits = 2) {
  if (!String(value ?? '').trim()) return '';
  const numeric = parsePtBrUserText(value);
  return numeric === null ? '' : formatPtBrMoneyInput(numeric, maximumFractionDigits);
}

export function serializePtBrMoneyTierDrafts(drafts) {
  const preservedDrafts = Array.isArray(drafts) ? drafts.map((draft) => ({ ...draft })) : [];
  const errors = [];
  const tiers = [];

  for (const draft of preservedDrafts) {
    const quantity = Number(String(draft.quantity ?? '').trim());
    const unitState = parsePtBrMoneyDraft(draft.unitPrice, 4);
    const totalState = parsePtBrMoneyDraft(draft.totalPrice, 2);
    const error = {
      draftId: String(draft.draftId ?? ''),
      quantity: null,
      unitPrice: null,
      totalPrice: null
    };

    if (!Number.isInteger(quantity) || quantity <= 0) {
      error.quantity = 'Informe uma quantidade maior que zero.';
    }
    if (draft.unitPriceValid === false || (!unitState.empty && !unitState.valid)) {
      error.unitPrice = 'Informe um valor válido.';
    }
    if (draft.totalPriceValid === false || (!totalState.empty && !totalState.valid)) {
      error.totalPrice = 'Informe um valor válido.';
    }
    if ((unitState.value ?? 0) < 0) {
      error.unitPrice = 'O valor não pode ser negativo.';
    }
    if ((totalState.value ?? 0) < 0) {
      error.totalPrice = 'O valor não pode ser negativo.';
    }

    const unitPrice = unitState.value ?? 0;
    const totalPrice = totalState.value ?? 0;
    const effectiveTotal = totalPrice > 0
      ? Math.round(totalPrice * 100) / 100
      : quantity > 0 && unitPrice > 0
        ? Math.round(quantity * unitPrice * 100) / 100
        : 0;
    const effectiveUnitPrice = unitPrice > 0
      ? Math.round(unitPrice * 10000) / 10000
      : quantity > 0 && effectiveTotal > 0
        ? Math.round((effectiveTotal / quantity) * 10000) / 10000
        : 0;

    if (!error.unitPrice && !error.totalPrice && (effectiveUnitPrice <= 0 || effectiveTotal <= 0)) {
      error.unitPrice = 'Informe um valor maior que zero.';
    }

    if (error.quantity || error.unitPrice || error.totalPrice) {
      errors.push(error);
      continue;
    }

    tiers.push({
      quantity,
      unit_price: effectiveUnitPrice,
      total_price: effectiveTotal,
      ...(String(draft.productionTime ?? '').trim()
        ? { production_time: String(draft.productionTime).trim() }
        : {})
    });
  }

  const valid = preservedDrafts.length > 0 && errors.length === 0 && tiers.length === preservedDrafts.length;
  return {
    valid,
    saveAllowed: valid,
    serializationAllowed: valid,
    silentTierDrop: false,
    drafts: preservedDrafts,
    tiers: valid ? tiers : null,
    errors
  };
}
