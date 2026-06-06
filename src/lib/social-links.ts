type SocialNetwork = 'instagram' | 'facebook' | 'youtube';

const SOCIAL_BASE_URLS: Record<SocialNetwork, string> = {
  instagram: 'https://instagram.com',
  facebook: 'https://facebook.com',
  youtube: 'https://youtube.com'
};

const SOCIAL_HOSTS: Record<SocialNetwork, string[]> = {
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be']
};

export function normalizeSocialPath(value: string | null | undefined, network?: SocialNetwork) {
  const rawValue = (value || '').trim();
  if (!rawValue) return '';

  let candidate = rawValue;

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();
    const knownHosts = network ? SOCIAL_HOSTS[network] : Object.values(SOCIAL_HOSTS).flat();

    if (knownHosts.includes(host)) {
      candidate = `${url.pathname}${url.search}`.trim();
    }
  } catch {
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
      candidate = '';
    }
  }

  candidate = candidate.replace(/^@+/, '').trim();
  if (!candidate) return '';

  return candidate.startsWith('/') ? candidate : `/${candidate}`;
}

export function buildSocialHref(network: SocialNetwork, value: string | null | undefined) {
  const path = normalizeSocialPath(value, network);
  return path ? `${SOCIAL_BASE_URLS[network]}${path}` : '';
}
