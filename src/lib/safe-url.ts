const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(value: string | null | undefined, fallback = '#') {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed || fallback;
  }

  try {
    const url = new URL(trimmed);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol) ? trimmed : fallback;
  } catch {
    return fallback;
  }
}
