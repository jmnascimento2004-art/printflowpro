export function normalizeWhatsAppPhone(phone?: string | null): string {
  let digits = String(phone || '').replace(/\D/g, '');

  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!digits) return '';

  if (digits.startsWith('55')) {
    const nationalDigits = digits.slice(2);
    if (nationalDigits.length === 10 || nationalDigits.length === 11) return digits;
    return '';
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return '';
}

export function validateWhatsAppPhone(phone?: string | null): boolean {
  return normalizeWhatsAppPhone(phone).length > 0;
}

export function buildWhatsAppUrl(phone: string, message = ''): string {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return '';

  const encodedMessage = encodeURIComponent(message);
  const searchParams = new URLSearchParams({ phone: normalizedPhone });
  if (encodedMessage) searchParams.set('text', message);

  return `https://web.whatsapp.com/send?${searchParams.toString()}`;
}

export function openWhatsAppUrl(phone: string, message = ''): boolean {
  if (typeof window === 'undefined') return false;

  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
