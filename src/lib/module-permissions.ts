export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  '/reports': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/agenda': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/dashboard': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/pos': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/crm': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/whatsapp': ['admin', 'gerente'],
  '/customers': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/products': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/quotes': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/pricing': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/orders': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/production': ['admin', 'gerente', 'producao', 'arte_finalista'],
  '/financial': ['admin', 'gerente', 'financeiro'],
  '/stock': ['admin', 'gerente', 'financeiro', 'producao', 'estoque'],
  '/shipment': ['admin', 'gerente', 'financeiro', 'producao'],
  '/resale': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/settings': ['admin', 'gerente'],
};

export const canAccessModule = (role: string, path: string, configured: Record<string, string[]>) =>
  (configured[path] || DEFAULT_ROLE_PERMISSIONS[path] || []).includes(role);
