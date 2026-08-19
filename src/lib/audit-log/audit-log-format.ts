export const AUDIT_MODULE_LABELS: Record<string, string> = {
  catalog: 'Catálogo',
  categories: 'Categorias',
  customers: 'Clientes',
  financial: 'Financeiro',
  orders: 'Pedidos',
  pos: 'PDV / Caixa',
  production: 'Produção',
  products: 'Produtos',
  quotes: 'Orçamentos',
  settings: 'Configurações',
  shipment: 'Expedição',
  stock: 'Estoque',
  suppliers: 'Fornecedores',
  whatsapp: 'WhatsApp'
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'cash_register.balance_changed': 'Saldo do caixa alterado',
  'cash_register.closed': 'Caixa fechado',
  'cash_register.deleted': 'Sessão de caixa removida',
  'cash_register.opened': 'Caixa aberto',
  'catalog.appearance_changed': 'Aparência do catálogo alterada',
  'catalog.banner_created': 'Banner criado',
  'catalog.banner_deleted': 'Banner excluído',
  'catalog.banner_order_changed': 'Ordem dos banners alterada',
  'catalog.banner_status_changed': 'Status do banner alterado',
  'catalog.banner_updated': 'Banner atualizado',
  'catalog.category_featured_changed': 'Destaque de categoria alterado',
  'catalog.configuration_changed': 'Configuração do catálogo alterada',
  'catalog.mega_menu_changed': 'Mega Menu alterado',
  'category.created': 'Categoria criada',
  'category.deleted': 'Categoria removida',
  'category.hierarchy_changed': 'Hierarquia da categoria alterada',
  'category.updated': 'Categoria atualizada',
  'company.configuration_changed': 'Dados da empresa alterados',
  'customer.created': 'Cliente criado',
  'customer.deleted': 'Cliente removido',
  'customer.updated': 'Cliente atualizado',
  'financial.payment_changed': 'Situação do pagamento alterada',
  'financial.transaction_created': 'Lançamento financeiro criado',
  'financial.transaction_deleted': 'Lançamento financeiro removido',
  'inventory.adjusted': 'Movimento de estoque registrado',
  'order.created': 'Pedido criado',
  'order.deleted': 'Pedido removido',
  'order.status_changed': 'Status do pedido alterado',
  'order.updated': 'Pedido atualizado',
  'pickup_point.created': 'Ponto de coleta criado',
  'pickup_point.deleted': 'Ponto de coleta removido',
  'pickup_point.status_changed': 'Status do ponto de coleta alterado',
  'pickup_point.updated': 'Ponto de coleta atualizado',
  'product.category_changed': 'Categoria do produto alterada',
  'product.created': 'Produto criado',
  'product.deleted': 'Produto removido',
  'product.price_changed': 'Preço do produto alterado',
  'product.status_changed': 'Status do produto alterado',
  'product.updated': 'Produto atualizado',
  'production.item_created': 'Item incluído na produção',
  'production.item_removed': 'Item removido da produção',
  'production.item_updated': 'Item da produção atualizado',
  'production.priority_changed': 'Prioridade da produção alterada',
  'production.responsible_changed': 'Responsável pela produção alterado',
  'production.stage_changed': 'Fase de produção alterada',
  'quote.approved': 'Orçamento aprovado',
  'quote.created': 'Orçamento criado',
  'quote.deleted': 'Orçamento removido',
  'quote.rejected': 'Orçamento rejeitado',
  'quote.status_changed': 'Status do orçamento alterado',
  'quote.updated': 'Orçamento atualizado',
  'settings.configuration_changed': 'Configuração empresarial alterada',
  'settings.default_service_created': 'Serviço padrão criado',
  'settings.default_service_deleted': 'Serviço padrão removido',
  'settings.default_service_updated': 'Serviço padrão atualizado',
  'settings.financial_updated': 'Configuração financeira alterada',
  'settings.pix_updated': 'Configuração PIX alterada',
  'shipment.created': 'Expedição criada',
  'shipment.deleted': 'Expedição removida',
  'shipment.status_changed': 'Expedição atualizada',
  'supplier.created': 'Fornecedor criado',
  'supplier.deleted': 'Fornecedor removido',
  'supplier.updated': 'Fornecedor atualizado',
  'user.added': 'Usuário adicionado',
  'user.permission_changed': 'Permissão alterada',
  'user.permission_created': 'Permissão criada',
  'user.permission_deleted': 'Permissão removida',
  'user.removed': 'Usuário removido',
  'user.role_changed': 'Papel do usuário alterado',
  'user.status_changed': 'Status do usuário alterado',
  'user.updated': 'Usuário atualizado',
  'whatsapp.configuration_changed': 'Configuração do WhatsApp alterada',
  'whatsapp.custom_message_created': 'Mensagem personalizada criada',
  'whatsapp.custom_message_deleted': 'Mensagem personalizada removida',
  'whatsapp.custom_message_updated': 'Mensagem personalizada atualizada',
  'whatsapp.event_status_changed': 'Status do evento WhatsApp alterado',
  'whatsapp.template_created': 'Template WhatsApp criado',
  'whatsapp.template_deleted': 'Template WhatsApp removido',
  'whatsapp.template_updated': 'Template WhatsApp alterado'
};

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto', acabamento: 'Acabamento', aprovado: 'Aprovado',
  cancelado: 'Cancelado', concluido: 'Pronto', entregue: 'Entregue',
  expedicao: 'Em expedição', fechado: 'Fechado', fila: 'Aguardando',
  finalizado: 'Finalizado', impressao: 'Impressão', pago: 'Pago',
  parcial: 'Parcial', pendente: 'Pendente', producao: 'Produção',
  reprovado: 'Reprovado', rascunho: 'Rascunho'
};

const MONEY_KEYS = /(?:amount|price|cost|credit|balance|fee|discount)/i;

export function formatAuditValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Nenhum';
  if (typeof value === 'number' && MONEY_KEYS.test(key)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const normalized = String(value);
  return STATUS_LABELS[normalized] || normalized;
}

const IMPORTANT_KEYS = [
  'status', 'sales_price', 'role', 'active', 'responsible_name', 'priority',
  'sort_order', 'roles', 'amount', 'paid_amount', 'default_price', 'name'
];

export function primaryAuditDelta(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
) {
  const keys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])];
  const key = IMPORTANT_KEYS.find((candidate) => keys.includes(candidate)) || keys[0] || '';
  return {
    key,
    before: key ? formatAuditValue(key, oldValues[key]) : '—',
    after: key ? formatAuditValue(key, newValues[key]) : '—'
  };
}

export function auditEntityLabel(
  entityId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
) {
  return String(
    newValues.name || oldValues.name || newValues.product_name || oldValues.product_name
    || newValues.order_number || oldValues.order_number || entityId
  );
}
