export const PRIVACY_POLICY_VERSION = '2026-06';
export const TERMS_VERSION = '2026-06';
export const COOKIE_POLICY_VERSION = '2026-06';

export type CookieCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';
export type ConsentType =
  | 'privacy_policy'
  | 'terms_of_use'
  | 'marketing_email'
  | 'marketing_whatsapp'
  | 'marketing_sms'
  | 'push_notifications'
  | 'personalized_campaigns'
  | 'cookie_preferences'
  | 'cookie_analytics'
  | 'cookie_marketing';

export type DataSubjectRequestType =
  | 'acesso'
  | 'correcao'
  | 'exclusao'
  | 'anonimizacao'
  | 'portabilidade'
  | 'revogacao_consentimento'
  | 'informacao_compartilhamento'
  | 'oposicao_tratamento'
  | 'outro';

export type CookiePreferences = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export const defaultCookiePreferences: CookiePreferences = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false
};

export const allCookiePreferences: CookiePreferences = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true
};

export const DATA_INVENTORY = [
  {
    category: 'Identificacao',
    data: 'nome, razao social, nome fantasia, CPF/CNPJ',
    purpose: 'Cadastro, emissao de orcamento, pedido, atendimento e obrigacoes fiscais quando aplicavel.',
    legalBasis: 'Execucao de contrato e obrigacao legal/regulatoria.',
    storage: 'Supabase: customers, store_customer_accounts e registros comerciais vinculados.',
    access: 'Loja responsavel, equipe autorizada e o proprio cliente autenticado.',
    retention: 'Durante a relacao comercial e pelo prazo legal/fiscal aplicavel.',
    sharing: 'Pode ser compartilhado com emissores fiscais, pagamento, entrega e atendimento quando configurados.'
  },
  {
    category: 'Contato',
    data: 'e-mail, telefone e WhatsApp',
    purpose: 'Login, recuperacao de conta, status de pedido, suporte e comunicacoes opcionais.',
    legalBasis: 'Execucao de contrato para atendimento/pedido; consentimento para marketing.',
    storage: 'Supabase Auth, customers e customer_consents.',
    access: 'Loja responsavel, plataforma e cliente autenticado.',
    retention: 'Durante a conta ativa e enquanto houver necessidade comercial, legal ou de defesa de direitos.',
    sharing: 'Operadores de autenticacao, e-mail, WhatsApp/atendimento e suporte quando efetivamente configurados.'
  },
  {
    category: 'Endereco e entrega',
    data: 'CEP, rua, numero, complemento, bairro, cidade, UF, referencias de entrega',
    purpose: 'Entrega, retirada, calculo logistico e atendimento do pedido.',
    legalBasis: 'Execucao de contrato.',
    storage: 'customer_addresses, quotes, orders e campos de entrega.',
    access: 'Loja responsavel, cliente autenticado e operadores logisticos quando aplicavel.',
    retention: 'Enquanto necessario para pedidos, garantias, suporte e obrigacoes legais.',
    sharing: 'Transportadoras, motoboy, retirada ou outros operadores de entrega configurados pela loja.'
  },
  {
    category: 'Historico comercial',
    data: 'historico de pedidos, itens comprados, orcamentos, carrinho e dados de checkout',
    purpose: 'Processar compra, acompanhar pedido, suporte, garantia e gestao operacional.',
    legalBasis: 'Execucao de contrato, obrigacao legal e defesa de direitos.',
    storage: 'quotes, quote_items, orders e order_items.',
    access: 'Loja responsavel, equipe autorizada e cliente autenticado apenas nos proprios registros.',
    retention: 'Conforme prazos comerciais, fiscais e contabeis definidos pela loja.',
    sharing: 'Pagamentos, entrega e atendimento quando necessario ao pedido.'
  },
  {
    category: 'Pagamento',
    data: 'status, metodo, valor, identificador de transacao e referencia do gateway',
    purpose: 'Confirmar pagamento, conciliar venda, prevenir fraude e cumprir obrigacoes legais.',
    legalBasis: 'Execucao de contrato e obrigacao legal/regulatoria.',
    storage: 'Registros internos de transacao quando houver gateway integrado; dados completos de cartao nao devem ser armazenados.',
    access: 'Loja responsavel e operadores financeiros autorizados.',
    retention: 'Conforme prazos fiscais, contabeis e antifraude.',
    sharing: 'Gateway de pagamento e instituicoes financeiras efetivamente utilizadas.'
  },
  {
    category: 'Tecnicos e seguranca',
    data: 'IP reduzido/pseudonimizado quando necessario, logs, identificador tecnico, cookies, PWA cache, localStorage e dados de autenticacao',
    purpose: 'Seguranca, login, prevencao de abuso, preferencias essenciais e operacao do PWA.',
    legalBasis: 'Execucao de contrato, legitimo interesse documentado para seguranca e consentimento para cookies nao essenciais.',
    storage: 'Supabase Auth, cookie_preferences, customer_consents, service worker e armazenamento local limitado.',
    access: 'Plataforma, loja quando necessario e operadores tecnicos.',
    retention: 'Minimo necessario para seguranca, auditoria e preferencia do usuario.',
    sharing: 'Hospedagem, banco/autenticacao e ferramentas tecnicas efetivamente configuradas.'
  }
];

export const cookieCategoryLabels: Record<CookieCategory, { title: string; description: string; required?: boolean }> = {
  necessary: {
    title: 'Necessarios',
    description: 'Mantem login, seguranca, carrinho, checkout, PWA e preferencias tecnicas essenciais.',
    required: true
  },
  preferences: {
    title: 'Preferencias',
    description: 'Guarda escolhas de navegacao e personalizacao nao essencial, como tema do catalogo.'
  },
  analytics: {
    title: 'Analiticos',
    description: 'Permite metricas de uso e desempenho somente quando houver ferramenta configurada e consentimento.'
  },
  marketing: {
    title: 'Marketing',
    description: 'Permite pixels, remarketing e anuncios personalizados somente quando houver ferramenta configurada e consentimento.'
  }
};

export const dataSubjectRequestLabels: Record<DataSubjectRequestType, string> = {
  acesso: 'Acesso aos dados',
  correcao: 'Correcao de dados',
  exclusao: 'Exclusao de conta/dados',
  anonimizacao: 'Anonimizacao',
  portabilidade: 'Portabilidade',
  revogacao_consentimento: 'Revogacao de consentimento',
  informacao_compartilhamento: 'Informacoes sobre compartilhamento',
  oposicao_tratamento: 'Oposicao ao tratamento',
  outro: 'Outro'
};

export const getPrivacyContact = (company: { email?: string; phone?: string; name?: string }) => {
  return {
    email: company.email || 'privacidade@empresa.com.br',
    channel: company.phone ? `WhatsApp/telefone ${company.phone}` : company.email || 'canal de atendimento da loja',
    dpo: 'Contato de privacidade da loja'
  };
};

export const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
};
