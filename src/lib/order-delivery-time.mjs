const FALLBACK_LABEL = 'Prazo sob consulta';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseBusinessDays(value) {
  const label = normalizeText(value);
  if (!label) return null;

  const match = label.match(/(?:^|\D)(\d+)(?:\s*)(?:dia|dias)\b/i);
  if (!match) return null;

  const days = Number(match[1]);
  return Number.isInteger(days) && days > 0 ? days : null;
}

export function getItemDeliveryTimeSnapshot(item) {
  const details = item?.details || {};
  const configurationSnapshot = details.configuration_snapshot || {};
  const pricingSnapshot = details.pricing_snapshot || {};
  const label = normalizeText(
    configurationSnapshot.production_time ??
    details.production_time ??
    pricingSnapshot.production_time
  );

  return {
    label: label || FALLBACK_LABEL,
    businessDays: parseBusinessDays(label),
    source: label ? 'item_snapshot' : 'fallback'
  };
}

export function resolveOrderDeliveryTime(items) {
  const snapshots = Array.isArray(items) ? items.map(getItemDeliveryTimeSnapshot) : [];
  if (snapshots.length === 0 || snapshots.some((snapshot) => snapshot.businessDays === null)) {
    return {
      label: FALLBACK_LABEL,
      businessDays: null,
      source: 'fallback',
      isComplete: false
    };
  }

  const businessDays = Math.max(...snapshots.map((snapshot) => snapshot.businessDays));
  return {
    label: `${businessDays} ${businessDays === 1 ? 'dia útil' : 'dias úteis'}`,
    businessDays,
    source: 'item_snapshot',
    isComplete: true
  };
}

export { FALLBACK_LABEL as ORDER_DELIVERY_TIME_FALLBACK };
