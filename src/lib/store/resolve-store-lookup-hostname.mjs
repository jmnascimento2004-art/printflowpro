import 'server-only';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeConfiguredHostname(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const hostname = value.toLowerCase().replace(/\.$/, '');
  if (!hostname || /[\s/\\@?#:\r\n]/.test(hostname) || !HOSTNAME_PATTERN.test(hostname)) return null;
  return hostname;
}

export function resolveStoreLookupHostname(incomingHost, environment = process.env) {
  if (!incomingHost || LOCAL_HOSTNAMES.has(incomingHost)) return incomingHost;
  if (environment.VERCEL !== '1' || environment.VERCEL_ENV !== 'preview') return incomingHost;

  const deploymentHosts = [environment.VERCEL_URL, environment.VERCEL_BRANCH_URL]
    .map(normalizeConfiguredHostname)
    .filter(Boolean);

  if (!deploymentHosts.includes(incomingHost)) return incomingHost;

  return normalizeConfiguredHostname(environment.STORE_PREVIEW_CANONICAL_HOST) || incomingHost;
}
