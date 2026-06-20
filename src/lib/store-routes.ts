const ALLOWED_STORE_REDIRECTS = [
  '/store',
  '/store?checkout=1',
  '/store/conta',
  '/store/conta/perfil',
  '/store/conta/enderecos',
  '/store/conta/pedidos',
  '/store/conta/seguranca',
  '/store/conta/privacidade',
  '/store/login',
  '/store/cadastro',
  '/store/recuperar-senha',
  '/store/redefinir-senha',
  '/store/privacidade',
  '/store/cookies',
  '/store/termos',
  '/store/privacidade/solicitar'
];

export const STORE_ROUTES = {
  home: '/store',
  checkout: '/store?checkout=1',
  login: '/store/login',
  signup: '/store/cadastro',
  account: '/store/conta',
  profile: '/store/conta/perfil',
  addresses: '/store/conta/enderecos',
  orders: '/store/conta/pedidos',
  security: '/store/conta/seguranca',
  privacy: '/store/conta/privacidade',
  publicPrivacy: '/store/privacidade',
  resetPassword: '/store/recuperar-senha',
  updatePassword: '/store/redefinir-senha'
} as const;

export const storeRoutes = STORE_ROUTES;

export const withStoreRedirect = (target: string, redirect: string) => {
  const safeRedirect = sanitizeStoreRedirect(redirect);
  return safeRedirect ? `${target}?redirect=${encodeURIComponent(safeRedirect)}` : target;
};

export const sanitizeStoreRedirect = (value?: string | null) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/store')) return '';
  if (trimmed.startsWith('//') || trimmed.includes('://')) return '';
  if (trimmed.startsWith('/store/../') || trimmed.includes('/..')) return '';
  if (trimmed.startsWith('/store/admin') || trimmed.startsWith('/store/dashboard')) return '';

  const [pathname, query = ''] = trimmed.split('?');
  const isOrderDetail = /^\/store\/conta\/pedidos\/[^/?#]+$/.test(pathname);
  if (!isOrderDetail && !ALLOWED_STORE_REDIRECTS.includes(pathname) && !ALLOWED_STORE_REDIRECTS.includes(trimmed)) return '';
  if (query && trimmed !== '/store?checkout=1') return '';
  return trimmed;
};
