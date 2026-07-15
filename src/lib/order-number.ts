export const formatOrderDisplayNumber = (orderNumber?: string | null): string => {
  const value = String(orderNumber || '').trim();
  if (!value) return 'PED';

  if (/^PED-/i.test(value)) return value.replace(/^ped-/i, 'PED-');
  if (/^ORD-/i.test(value)) return value.replace(/^ord-/i, 'PED-');
  if (/^\d+$/.test(value)) return `PED-${value.padStart(4, '0')}`;

  return value;
};

export const formatLegacyOrderNumber = (orderNumber?: string | null): string => {
  const displayNumber = formatOrderDisplayNumber(orderNumber);
  if (/^PED-/i.test(displayNumber)) return displayNumber.replace(/^ped-/i, 'ORD-');
  return String(orderNumber || '').trim();
};

export const getOrderNumberSearchText = (orderNumber?: string | null): string => {
  const raw = String(orderNumber || '').trim();
  return [raw, formatOrderDisplayNumber(raw), formatLegacyOrderNumber(raw)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const areOrderNumbersEquivalent = (left?: string | null, right?: string | null): boolean => {
  const leftValue = String(left || '').trim();
  const rightValue = String(right || '').trim();
  if (!leftValue || !rightValue) return false;

  return (
    leftValue.toLowerCase() === rightValue.toLowerCase() ||
    formatOrderDisplayNumber(leftValue).toLowerCase() === formatOrderDisplayNumber(rightValue).toLowerCase()
  );
};

export const replaceOrderNumbersForDisplay = (text?: string | null): string =>
  String(text || '').replace(/\bORD-(\d+)\b/gi, 'PED-$1');
