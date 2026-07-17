import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 5_000;
const ALLOWED_DATA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_REMOTE_TYPES = new Set(ALLOWED_DATA_TYPES);

export function parseAllowedImageHosts(value = '') {
  return new Set(
    value
      .split(',')
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean)
  );
}

export function isBlockedIp(address) {
  const normalized = address.toLowerCase().split('%')[0];

  if (isIP(normalized) === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b] = octets;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:')
    );
  }

  return true;
}

export async function validateRemoteImageUrl(rawUrl, options = {}) {
  const allowedHosts = options.allowedHosts || new Set();
  const lookupFn = options.lookupFn || lookup;
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipHostname = hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    (url.port && url.port !== '443') || !allowedHosts.has(hostname) ||
    hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(ipHostname)
  ) {
    return null;
  }

  let addresses;
  try {
    addresses = await lookupFn(hostname, { all: true, verbatim: true });
  } catch {
    return null;
  }

  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) return null;
  return url;
}

export function decodeImageDataUrl(src) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(src);
  if (!match || !ALLOWED_DATA_TYPES.has(match[1].toLowerCase())) return null;

  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(match[2], 'base64');
  return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
}

async function readLimitedBody(response, maxBytes = MAX_IMAGE_BYTES) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes || !response.body) return null;

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export async function fetchValidatedRemoteImage(rawUrl, options = {}) {
  const url = await validateRemoteImageUrl(rawUrl, options);
  if (!url) return null;

  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs || REMOTE_IMAGE_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    });
    if (!response.ok || (response.status >= 300 && response.status < 400)) return null;

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_REMOTE_TYPES.has(contentType)) return null;
    return readLimitedBody(response);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
