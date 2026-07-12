const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeStoreHost(value?: string | null): string | null {
  const firstValue = String(value || '').split(',')[0]?.trim().toLowerCase();
  if (!firstValue) return null;

  const withoutProtocol = firstValue.replace(/^https?:\/\//, '');
  const authority = withoutProtocol.split(/[/?#]/, 1)[0]?.replace(/\.$/, '') || '';
  const withoutPort = authority.replace(/:\d+$/, '');
  const hostname = withoutPort.replace(/^www\./, '');

  if (!hostname || !HOSTNAME_PATTERN.test(hostname)) return null;
  return hostname;
}

export function isLocalStoreHost(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}
