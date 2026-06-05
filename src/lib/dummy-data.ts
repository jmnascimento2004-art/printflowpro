export interface Company {
  id: string;
  name: string;
  document: string;
  logo_url?: string;
  logo_light?: string;
  logo_dark?: string;
  favicon?: string;
  phone?: string;
  email?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  theme_color?: string;
  instagram_url?: string;
  facebook_url?: string;
  youtube_url?: string;
  refund_policy?: string;
  show_payments_visa?: boolean;
  show_payments_mastercard?: boolean;
  show_payments_elo?: boolean;
  show_payments_hipercard?: boolean;
  show_payments_diners?: boolean;
  show_payments_amex?: boolean;
  show_payments_boleto?: boolean;
  show_payments_deposito?: boolean;
  show_payments_transferencia?: boolean;
  show_payments_pix?: boolean;
  show_delivery_sedex?: boolean;
  show_delivery_pac?: boolean;
  show_delivery_correios?: boolean;
  show_delivery_jadlog?: boolean;
  show_delivery_motoboy?: boolean;
  show_security_letsencrypt?: boolean;
  show_security_google?: boolean;
  card_benefits_1_title?: string;
  card_benefits_1_subtitle?: string;
  card_benefits_1_active?: boolean;
  card_benefits_2_title?: string;
  card_benefits_2_subtitle?: string;
  card_benefits_2_active?: boolean;
  card_benefits_3_title?: string;
  card_benefits_3_subtitle?: string;
  card_benefits_3_active?: boolean;
  card_benefits_4_title?: string;
  card_benefits_4_subtitle?: string;
  card_benefits_4_active?: boolean;
  img_payments_visa?: string;
  img_payments_mastercard?: string;
  img_payments_elo?: string;
  img_payments_hipercard?: string;
  img_payments_diners?: string;
  img_payments_amex?: string;
  img_payments_boleto?: string;
  img_payments_transferencia?: string;
  img_payments_pix?: string;
  img_delivery_sedex?: string;
  img_delivery_pac?: string;
  img_delivery_correios?: string;
  img_delivery_jadlog?: string;
  img_delivery_motoboy?: string;
  img_security_letsencrypt?: string;
  img_security_google?: string;
}

export interface UserProfile {
  id: string;
  company_id: string;
  auth_user_id?: string | null;
  name: string;
  email: string;
  role: 'admin' | 'gerente' | 'financeiro' | 'vendas' | 'producao' | 'estoque' | 'arte_finalista';
  active: boolean;
  phone?: string;
  avatar_url?: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
  tags: string[];
  notes: string;
  billing_type?: 'imediato' | 'faturado';
  credit_limit?: number;
  credit_used?: number;
  payment_terms_days?: number;
  credit_status?: 'aprovado' | 'bloqueado' | 'sob_analise';
  corporate_additional_info?: {
    inscricao_estadual?: string;
    nome_fantasia?: string;
    responsavel_financeiro_nome?: string;
    responsavel_financeiro_phone?: string;
    responsavel_financeiro_email?: string;
  };
  created_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface PricingDetails {
  raw_material_cost: number;
  operating_cost: number;
  production_time: number; // minutes
  markup: number; // percentage
  commission: number; // percentage
  taxes: number; // percentage
  waste_percent: number; // percentage
  calculated_price: number;
}

export interface VolumePriceTier {
  min_qty: number;
  price: number;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string;
  sku: string;
  pricing_type: 'unidade' | 'm2' | 'linear' | 'pacote' | 'kit';
  base_cost: number;
  sales_price: number;
  stock_controlled: boolean;
  min_stock: number;
  current_stock: number;
  active: boolean;
  pricing_details?: PricingDetails;
  created_at: string;
  image_url?: string;
  volume_pricing?: VolumePriceTier[];
  is_promo?: boolean;
  is_highlight?: boolean;
}

export interface QuoteItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  details?: {
    width?: number;
    height?: number;
    notes?: string;
  };
}

export interface Quote {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  number: number;
  status: 'rascunho' | 'pendente' | 'aprovado' | 'reprovado';
  total_amount: number;
  discount: number;
  valid_until: string;
  notes: string;
  items: QuoteItem[];
  created_at: string;
  delivery_type?: 'retirada' | 'motoboy' | 'carro' | 'correios';
  delivery_address?: string;
  delivery_distance_km?: number;
  delivery_fee?: number;
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  details?: {
    width?: number;
    height?: number;
    notes?: string;
  };
  outsourced: boolean;
  supplier_id?: string;
  supplier_name?: string;
  outsourced_cost?: number;
}

export interface Order {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  number: string;
  status: 'orcamento' | 'aguardando_aprovacao' | 'aguardando_pagamento' | 'producao' | 'impressao' | 'acabamento' | 'expedicao' | 'entregue' | 'finalizado' | 'cancelado';
  total_amount: number;
  paid_amount: number;
  payment_status: 'pendente' | 'parcial' | 'pago' | 'reembolsado';
  shipping_cost: number;
  deadline: string;
  notes: string;
  items: OrderItem[];
  created_at: string;
  delivery_type?: 'retirada' | 'motoboy' | 'carro' | 'correios';
  delivery_address?: string;
  delivery_distance_km?: number;
}

export interface ProductionItem {
  id: string;
  company_id: string;
  order_id: string;
  order_number: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  status: 'fila' | 'producao' | 'impressao' | 'acabamento' | 'concluido';
  priority: 'baixa' | 'media' | 'alta';
  deadline: string;
  responsible_name?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

export interface FinancialTransaction {
  id: string;
  company_id: string;
  order_id?: string;
  order_number?: string;
  type: 'receita' | 'despesa';
  category: string;
  amount: number;
  description: string;
  payment_method: 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'faturado';
  status: 'pendente' | 'pago';
  due_date: string;
  paid_at?: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  company_id: string;
  product_id: string;
  product_name: string;
  type: 'entrada' | 'saida';
  quantity: number;
  reason: string;
  unit_cost: number;
  created_at: string;
}

export interface Shipment {
  id: string;
  company_id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  status: 'separacao' | 'embalagem' | 'enviado' | 'entregue';
  tracking_code?: string;
  carrier: string;
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
  shipped_at?: string;
  delivered_at?: string;
  created_at: string;
}

export interface PickupPoint {
  id: string;
  company_id: string;
  name: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  hours_week: string;
  hours_sat: string;
  active: boolean;
  address?: string;
  hours?: string;
}

export const DUMMY_COMPANY: Company = {
  id: 'c1',
  name: 'PrintFlowPRO Demo Ltda',
  document: '12.345.678/0001-90',
  logo_url: '',
  logo_light: '',
  logo_dark: '',
  favicon: '',
  phone: '(11) 98765-4321',
  email: 'contato@printflowpro.com.br',
  cep: '01310-100',
  street: 'Av. Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  theme_color: 'violet',
  instagram_url: 'https://instagram.com/printflowpro',
  facebook_url: 'https://facebook.com/printflowpro',
  youtube_url: 'https://youtube.com/printflowpro',
  refund_policy: 'Nossa política de devolução garante o reembolso integral em caso de defeitos de fabricação ou erros de impressão em até 7 dias após o recebimento. Para produtos personalizados, não realizamos trocas por insatisfação com a arte aprovada previamente pelo cliente. Entre em contato com nosso suporte para abrir uma solicitação de análise.',
  show_payments_visa: true,
  show_payments_mastercard: true,
  show_payments_elo: true,
  show_payments_hipercard: true,
  show_payments_diners: true,
  show_payments_amex: true,
  show_payments_boleto: true,
  show_payments_deposito: true,
  show_payments_transferencia: true,
  show_payments_pix: true,
  show_delivery_sedex: true,
  show_delivery_pac: true,
  show_delivery_correios: true,
  show_delivery_jadlog: true,
  show_delivery_motoboy: true,
  show_security_letsencrypt: true,
  show_security_google: true,
  card_benefits_1_title: 'Até 4x Sem Juros',
  card_benefits_1_subtitle: 'Parcela mínima de R$ 300,00 nos cartões Visa/Master.',
  card_benefits_1_active: true,
  card_benefits_2_title: 'Desconto no PIX',
  card_benefits_2_subtitle: 'Ganhe 5% de desconto automático em pagamentos à vista.',
  card_benefits_2_active: true,
  card_benefits_3_title: 'Frete Grátis Sul/SP',
  card_benefits_3_subtitle: 'Disponível em compras corporativas acima de R$ 500,00.',
  card_benefits_3_active: true,
  card_benefits_4_title: '100% Seguro',
  card_benefits_4_subtitle: 'Seus dados e gabarito protegidos por SSL corporativo.',
  card_benefits_4_active: true,
  img_payments_visa: "",
  img_payments_mastercard: "",
  img_payments_elo: "",
  img_payments_hipercard: "",
  img_payments_diners: "",
  img_payments_amex: "",
  img_payments_boleto: "",
  img_payments_transferencia: "",
  img_payments_pix: "",
  img_delivery_sedex: "",
  img_delivery_pac: "",
  img_delivery_correios: "",
  img_delivery_jadlog: "",
  img_delivery_motoboy: "",
  img_security_letsencrypt: "",
  img_security_google: ""
};

export const DUMMY_PROFILES: UserProfile[] = [
  { id: 'u1', company_id: 'c1', name: 'Jomar Administrador', email: 'admin@printflowpro.com.br', role: 'admin', active: true },
  { id: 'u6', company_id: 'c1', name: 'Geraldo Gerente', email: 'gerente@printflowpro.com.br', role: 'gerente', active: true },
  { id: 'u2', company_id: 'c1', name: 'Maria Financeiro', email: 'financeiro@printflowpro.com.br', role: 'financeiro', active: true },
  { id: 'u4', company_id: 'c1', name: 'Amanda Vendas', email: 'vendas@printflowpro.com.br', role: 'vendas', active: true },
  { id: 'u3', company_id: 'c1', name: 'Carlos Impressão', email: 'producao@printflowpro.com.br', role: 'producao', active: true },
  { id: 'u7', company_id: 'c1', name: 'Diego Designer', email: 'designer@printflowpro.com.br', role: 'arte_finalista', active: true },
  { id: 'u5', company_id: 'c1', name: 'Bruno Estoque', email: 'estoque@printflowpro.com.br', role: 'estoque', active: true }
];

export const DUMMY_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    company_id: 'c1',
    name: 'Restaurante Sabor & Arte',
    document: '23.456.789/0001-01',
    phone: '(11) 98765-4321',
    email: 'contato@saborearte.com.br',
    address: { street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', zip_code: '01310-100' },
    tags: ['VIP', 'Alimentação'],
    notes: 'Cliente fiel, sempre solicita banners e panfletos com urgência.',
    created_at: '2026-05-01T10:00:00Z'
  },
  {
    id: 'cust-2',
    company_id: 'c1',
    name: 'Academia FitLife',
    document: '34.567.890/0001-12',
    phone: '(11) 97654-3210',
    email: 'marketing@fitlife.com.br',
    address: { street: 'Rua das Flores', number: '150', neighborhood: 'Jardins', city: 'São Paulo', state: 'SP', zip_code: '01400-000' },
    tags: ['Fitness', 'Mensal'],
    notes: 'Precisa de adesivos de vinil recorrentes para sinalização interna.',
    created_at: '2026-05-10T14:30:00Z'
  },
  {
    id: 'cust-3',
    company_id: 'c1',
    name: 'Maria Souza Designer (Revenda)',
    document: '123.456.789-00',
    phone: '(21) 99999-8888',
    email: 'maria.souza@design.com',
    address: { street: 'Rua do Ouvidor', number: '50', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'RJ', zip_code: '20040-030' },
    tags: ['Revendedor', 'Desconto-Especial'],
    notes: 'Designer freelancer que terceiriza toda a produção gráfica conosco. Margem especial.',
    created_at: '2026-05-15T09:00:00Z'
  },
  {
    id: 'cust-4',
    company_id: 'c1',
    name: 'Imobiliária Novo Lar',
    document: '45.678.901/0001-23',
    phone: '(11) 96543-2109',
    email: 'vendas@novolar.com.br',
    address: { street: 'Alameda Lorena', number: '850', neighborhood: 'Cerqueira César', city: 'São Paulo', state: 'SP', zip_code: '01424-001' },
    tags: ['Corporativo'],
    notes: 'Sempre pede placas de "Aluga-se" e "Vende-se" em chapa de PS.',
    billing_type: 'faturado',
    credit_limit: 5000,
    credit_used: 1200,
    payment_terms_days: 30,
    credit_status: 'aprovado',
    corporate_additional_info: {
      inscricao_estadual: '123.456.789.111',
      nome_fantasia: 'Novo Lar Imobiliária',
      responsavel_financeiro_nome: 'Marcos Rezende',
      responsavel_financeiro_phone: '(11) 91234-5678',
      responsavel_financeiro_email: 'financeiro@novolar.com.br'
    },
    created_at: '2026-05-20T16:45:00Z'
  }
];

export const DUMMY_SUPPLIERS: Supplier[] = [
  { id: 'sup-1', company_id: 'c1', name: 'Suprimentos Gráficos Brasil', contact_name: 'Roberto Valente', phone: '(11) 3333-4444', email: 'vendas@supbrasil.com.br', notes: 'Fornecedor de vinil adesivo, lona e chapas de PS.', created_at: '2026-04-01T12:00:00Z' },
  { id: 'sup-2', company_id: 'c1', name: 'Placas & Acrílicos S.A.', contact_name: 'Sandra Gomes', phone: '(11) 3222-1111', email: 'sandra@placasacrilico.com.br', notes: 'Fornecedor de acrílicos recortados a laser.', created_at: '2026-04-10T12:00:00Z' },
  { id: 'sup-3', company_id: 'c1', name: 'Terceirizados DTF Express', contact_name: 'Antônio Santos', phone: '(11) 91111-2222', email: 'dtf@express.com.br', notes: 'Parceiro para terceirização de impressão DTF e UV DTF.', created_at: '2026-04-15T12:00:00Z' }
];

export const DUMMY_CATEGORIES: Category[] = [
  { id: 'cat-1', company_id: 'c1', name: 'Cartão de Visitas e Papelaria', description: 'Cartões, papel timbrado, envelopes, pastas e impressos institucionais.', created_at: '2026-05-01T08:00:00Z' },
  { id: 'cat-2', company_id: 'c1', name: 'Adesivos', description: 'Adesivos de vinil, meio corte, formatos variados.', created_at: '2026-05-01T08:05:00Z' },
  { id: 'cat-3', company_id: 'c1', name: 'Flyers, Panfletos e Folder', description: 'Divulgação rápida com panfletos, flyers e folders dobrados.', created_at: '2026-05-01T08:10:00Z' },
  { id: 'cat-4', company_id: 'c1', name: 'Embalagens e Sacolas', description: 'Sacolas personalizadas de papel, kraft e caixas.', created_at: '2026-05-01T08:15:00Z' },
  { id: 'cat-5', company_id: 'c1', name: 'Brindes, Presentes e Decoração', description: 'Canecas, camisas sublimadas, azulejos e decoração.', created_at: '2026-05-01T08:20:00Z' },
  { id: 'cat-6', company_id: 'c1', name: 'Catálogos, Livros e Revistas', description: 'Impressão editorial de catálogos e livretos.', created_at: '2026-05-01T08:25:00Z' },
  { id: 'cat-7', company_id: 'c1', name: 'Rótulos e Etiquetas', description: 'Rótulos adesivos e etiquetas de identificação comercial.', created_at: '2026-05-01T08:30:00Z' },
  { id: 'cat-8', company_id: 'c1', name: 'Linhas Especiais', description: 'Impressos com acabamentos especiais como verniz localizado ou hot stamping.', created_at: '2026-05-01T08:35:00Z' }
];

export const DUMMY_PRODUCTS: Product[] = [
  // Category 1: Cartão de Visitas e Papelaria
  {
    id: 'prod-4',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Cartão de Visita Couché 300g (Milheiro)',
    description: '1000 cartões de visita, verniz total UV frente, refile.',
    sku: 'PP-CAR-004',
    pricing_type: 'pacote',
    base_cost: 45.00,
    sales_price: 120.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    is_highlight: true,
    pricing_details: {
      raw_material_cost: 35.00,
      operating_cost: 5.00,
      production_time: 5,
      markup: 140,
      commission: 5,
      taxes: 6,
      waste_percent: 3,
      calculated_price: 120.00
    },
    created_at: '2026-05-02T10:45:00Z'
  },
  {
    id: 'prod-101',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Flyer',
    description: 'Flyers impressos em papel couché com excelente qualidade e brilho.',
    sku: 'PP-FLY-101',
    pricing_type: 'unidade',
    base_cost: 0.15,
    sales_price: 0.45,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    is_promo: true,
    pricing_details: {
      raw_material_cost: 0.08,
      operating_cost: 0.02,
      production_time: 1,
      markup: 200,
      commission: 5,
      taxes: 6,
      waste_percent: 2,
      calculated_price: 0.45
    },
    created_at: '2026-05-02T10:46:00Z'
  },
  {
    id: 'prod-102',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Pasta Personalizada',
    description: 'Pasta com bolsa interna para armazenar documentos com elegância.',
    sku: 'PP-PAS-102',
    pricing_type: 'unidade',
    base_cost: 1.50,
    sales_price: 4.80,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:47:00Z'
  },
  {
    id: 'prod-103',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Folder 2 Dobras',
    description: 'Folder corporativo impresso frente e verso com duas dobras verticais.',
    sku: 'PP-FOL-103',
    pricing_type: 'unidade',
    base_cost: 0.35,
    sales_price: 1.20,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:48:00Z'
  },
  {
    id: 'prod-104',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Folder 1 Dobra',
    description: 'Folder impresso com uma dobra central, perfeito para menus ou folhetos.',
    sku: 'PP-FOL-104',
    pricing_type: 'unidade',
    base_cost: 0.30,
    sales_price: 1.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:49:00Z'
  },
  {
    id: 'prod-105',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Envelope Personalizado',
    description: 'Envelope saco ou de carta timbrado com a marca da sua empresa.',
    sku: 'PP-ENV-105',
    pricing_type: 'unidade',
    base_cost: 0.25,
    sales_price: 0.80,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:50:00Z'
  },
  {
    id: 'prod-106',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Cartão Postal',
    description: 'Cartão postal rígido com verniz UV total localizado ou brilho.',
    sku: 'PP-POS-106',
    pricing_type: 'unidade',
    base_cost: 0.40,
    sales_price: 1.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:51:00Z'
  },
  {
    id: 'prod-107',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Papel Timbrado',
    description: 'Papel timbrado tamanho A4 para relatórios e contratos oficiais.',
    sku: 'PP-TIM-107',
    pricing_type: 'unidade',
    base_cost: 0.08,
    sales_price: 0.30,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:52:00Z'
  },
  {
    id: 'prod-108',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Receituário',
    description: 'Bloco de receituário médico personalizado em papel offset.',
    sku: 'PP-REC-108',
    pricing_type: 'unidade',
    base_cost: 0.08,
    sales_price: 0.30,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:53:00Z'
  },
  {
    id: 'prod-109',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Cartaz',
    description: 'Cartaz promocional tamanho A3 ou A2 para sinalização de pdv.',
    sku: 'PP-CAR-109',
    pricing_type: 'unidade',
    base_cost: 1.20,
    sales_price: 4.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:54:00Z'
  },
  {
    id: 'prod-110',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Bloco de Notas Personalizado',
    description: 'Bloco de notas com espiral ou wire-o e capa personalizada.',
    sku: 'PP-BLO-110',
    pricing_type: 'unidade',
    base_cost: 3.50,
    sales_price: 12.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:55:00Z'
  },
  {
    id: 'prod-111',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Bloco de Notas com Capa Blocado',
    description: 'Bloco de rascunhos blocado com cola na cabeceira.',
    sku: 'PP-BLO-111',
    pricing_type: 'unidade',
    base_cost: 2.20,
    sales_price: 7.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:56:00Z'
  },
  {
    id: 'prod-112',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Panfleto',
    description: 'Panfletos econômicos para distribuição em massa.',
    sku: 'PP-PAN-112',
    pricing_type: 'unidade',
    base_cost: 0.10,
    sales_price: 0.35,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:57:00Z'
  },
  {
    id: 'prod-113',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Flyer Premium',
    description: 'Flyer com papel couché encorpado e laminação fosca ou verniz localizado.',
    sku: 'PP-FLY-113',
    pricing_type: 'unidade',
    base_cost: 0.45,
    sales_price: 1.80,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:58:00Z'
  },
  {
    id: 'prod-114',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Crachá',
    description: 'Crachá de PVC rígido com impressão colorida digital.',
    sku: 'PP-CRA-114',
    pricing_type: 'unidade',
    base_cost: 1.80,
    sales_price: 6.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:59:00Z'
  },
  {
    id: 'prod-115',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Cordão para Crachá Personalizado',
    description: 'Cordão em poliéster acetinado personalizado com impressão digital.',
    sku: 'PP-COR-115',
    pricing_type: 'unidade',
    base_cost: 1.10,
    sales_price: 4.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:01:00Z'
  },
  {
    id: 'prod-116',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Folheto',
    description: 'Folhetos coloridos ideais para anúncios locais ou catálogos resumidos.',
    sku: 'PP-FOL-116',
    pricing_type: 'unidade',
    base_cost: 0.12,
    sales_price: 0.40,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:02:00Z'
  },
  {
    id: 'prod-117',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Cartão de Agradecimento Personalizado',
    description: 'Cartões de agradecimento para envios de e-commerce e sacolas.',
    sku: 'PP-AGR-117',
    pricing_type: 'unidade',
    base_cost: 0.15,
    sales_price: 0.60,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:03:00Z'
  },
  {
    id: 'prod-118',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Marca-Página',
    description: 'Marca-página personalizado com verniz total UV frente.',
    sku: 'PP-MAR-118',
    pricing_type: 'unidade',
    base_cost: 0.10,
    sales_price: 0.45,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:04:00Z'
  },
  {
    id: 'prod-119',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Bloco de Notas com Capa Wire-o',
    description: 'Bloco com espiral metálica wire-o de alta durabilidade.',
    sku: 'PP-BLO-119',
    pricing_type: 'unidade',
    base_cost: 4.50,
    sales_price: 15.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:05:00Z'
  },
  {
    id: 'prod-120',
    company_id: 'c1',
    category_id: 'cat-1',
    name: 'Bloco para Rascunho',
    description: 'Bloco econômico para rascunhos rápidos do dia a dia.',
    sku: 'PP-RAS-120',
    pricing_type: 'unidade',
    base_cost: 1.00,
    sales_price: 3.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:06:00Z'
  },

  // Category 2: Adesivos
  {
    id: 'prod-2',
    company_id: 'c1',
    category_id: 'cat-2',
    name: 'Adesivo Vinil Brilho',
    description: 'Adesivo vinil impresso em alta resolução com meio corte.',
    sku: 'AD-VIN-002',
    pricing_type: 'm2',
    base_cost: 18.00,
    sales_price: 55.00,
    stock_controlled: true,
    min_stock: 40,
    current_stock: 95,
    active: true,
    pricing_details: {
      raw_material_cost: 12.00,
      operating_cost: 3.50,
      production_time: 10,
      markup: 160,
      commission: 5,
      taxes: 6,
      waste_percent: 8,
      calculated_price: 55.00
    },
    created_at: '2026-05-02T10:15:00Z'
  },
  {
    id: 'prod-201',
    company_id: 'c1',
    category_id: 'cat-2',
    name: 'Adesivo Vinil Fosco',
    description: 'Adesivo vinil fosco premium antirreflexo.',
    sku: 'AD-VIN-201',
    pricing_type: 'm2',
    base_cost: 19.00,
    sales_price: 58.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:16:00Z'
  },

  // Category 3: Flyers, Panfletos e Folder
  {
    id: 'prod-301',
    company_id: 'c1',
    category_id: 'cat-3',
    name: 'Folder 3 Dobras Sanfona',
    description: 'Folder impresso em papel couché com 3 dobras no formato sanfona.',
    sku: 'PP-FOL-301',
    pricing_type: 'unidade',
    base_cost: 0.40,
    sales_price: 1.50,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:17:00Z'
  },

  // Category 4: Embalagens e Sacolas
  {
    id: 'prod-401',
    company_id: 'c1',
    category_id: 'cat-4',
    name: 'Sacola Kraft Personalizada',
    description: 'Sacola ecológica em papel kraft pardo com alça torcida.',
    sku: 'EM-SAC-401',
    pricing_type: 'unidade',
    base_cost: 1.20,
    sales_price: 3.80,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T10:18:00Z'
  },

  // Category 5: Brindes, Presentes e Decoração
  {
    id: 'prod-3',
    company_id: 'c1',
    category_id: 'cat-5',
    name: 'Caneca de Cerâmica Branca',
    description: 'Caneca branca resinada premium 325ml estampada por sublimação.',
    sku: 'BR-CAN-003',
    pricing_type: 'unidade',
    base_cost: 10.50,
    sales_price: 35.00,
    stock_controlled: true,
    min_stock: 30,
    current_stock: 14,
    active: true,
    pricing_details: {
      raw_material_cost: 8.50,
      operating_cost: 1.50,
      production_time: 8,
      markup: 200,
      commission: 5,
      taxes: 6,
      waste_percent: 5,
      calculated_price: 35.00
    },
    created_at: '2026-05-02T10:30:00Z'
  },
  {
    id: 'prod-5',
    company_id: 'c1',
    category_id: 'cat-5',
    name: 'Camisa Poliéster Branca Estampada',
    description: 'Camiseta de poliéster com estampa A4 sublimada frontal.',
    sku: 'RO-CAM-005',
    pricing_type: 'unidade',
    base_cost: 9.80,
    sales_price: 42.00,
    stock_controlled: true,
    min_stock: 25,
    current_stock: 80,
    active: true,
    pricing_details: {
      raw_material_cost: 6.80,
      operating_cost: 2.00,
      production_time: 12,
      markup: 220,
      commission: 5,
      taxes: 6,
      waste_percent: 4,
      calculated_price: 42.00
    },
    created_at: '2026-05-02T11:00:00Z'
  },

  // Category 6: Catálogos, Livros e Revistas
  {
    id: 'prod-601',
    company_id: 'c1',
    category_id: 'cat-6',
    name: 'Catálogo de Produtos A4',
    description: 'Catálogo institucional com capa couché 250g e miolo 115g, acabamento canoa.',
    sku: 'ED-CAT-601',
    pricing_type: 'unidade',
    base_cost: 4.50,
    sales_price: 18.00,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:07:00Z'
  },

  // Category 7: Rótulos e Etiquetas
  {
    id: 'prod-701',
    company_id: 'c1',
    category_id: 'cat-7',
    name: 'Rótulo Adesivo Couché',
    description: 'Rótulo em papel adesivo couché com brilho, ideal para embalagens secas.',
    sku: 'AD-ROT-701',
    pricing_type: 'unidade',
    base_cost: 0.05,
    sales_price: 0.20,
    stock_controlled: false,
    min_stock: 0,
    current_stock: 0,
    active: true,
    created_at: '2026-05-02T11:08:00Z'
  },

  // Category 8: Linhas Especiais
  {
    id: 'prod-1',
    company_id: 'c1',
    category_id: 'cat-8',
    name: 'Banner em Lona 440g',
    description: 'Banner impresso em alta resolução com bastão, ponteira e cordão.',
    sku: 'CV-BAN-001',
    pricing_type: 'm2',
    base_cost: 22.50,
    sales_price: 65.00,
    stock_controlled: true,
    min_stock: 50,
    current_stock: 120,
    active: true,
    pricing_details: {
      raw_material_cost: 15.00,
      operating_cost: 4.50,
      production_time: 15,
      markup: 150,
      commission: 5,
      taxes: 6,
      waste_percent: 10,
      calculated_price: 65.00
    },
    created_at: '2026-05-02T10:00:00Z'
  }
];

export const DUMMY_QUOTES: Quote[] = [
  {
    id: 'quote-101',
    company_id: 'c1',
    customer_id: 'cust-1',
    customer_name: 'Restaurante Sabor & Arte',
    number: 1001,
    status: 'aprovado',
    total_amount: 195.00,
    discount: 0,
    valid_until: '2026-06-15',
    notes: 'Aprovado pelo WhatsApp, aguardando faturamento.',
    items: [
      { id: 'qi-1', product_id: 'prod-1', product_name: 'Banner em Lona 440g', quantity: 3, unit_price: 65.00, total_price: 195.00, details: { width: 1, height: 1 } }
    ],
    created_at: '2026-05-28T09:00:00Z'
  },
  {
    id: 'quote-102',
    company_id: 'c1',
    customer_id: 'cust-2',
    customer_name: 'Academia FitLife',
    number: 1002,
    status: 'pendente',
    total_amount: 275.00,
    discount: 15.00,
    valid_until: '2026-06-20',
    notes: 'Orçamento enviado por e-mail. Cliente está avaliando as dimensões.',
    items: [
      { id: 'qi-2', product_id: 'prod-2', product_name: 'Adesivo Vinil Brilho', quantity: 5, unit_price: 55.00, total_price: 275.00, details: { width: 1, height: 1 } }
    ],
    created_at: '2026-06-01T15:00:00Z'
  }
];

export const DUMMY_ORDERS: Order[] = [
  {
    id: 'order-1',
    company_id: 'c1',
    customer_id: 'cust-1',
    customer_name: 'Restaurante Sabor & Arte',
    number: 'ORD-0001',
    status: 'producao',
    total_amount: 195.00,
    paid_amount: 97.50,
    payment_status: 'parcial',
    shipping_cost: 15.00,
    deadline: '2026-06-05T18:00:00Z',
    notes: 'Entregar na Av. Paulista, 1000. Entrada paga no Pix.',
    items: [
      { id: 'oi-1', product_id: 'prod-1', product_name: 'Banner em Lona 440g', quantity: 3, unit_price: 65.00, total_price: 195.00, details: { width: 1, height: 1, notes: 'Colocar bastões em cima e em baixo.' }, outsourced: false }
    ],
    created_at: '2026-05-28T09:10:00Z'
  },
  {
    id: 'order-2',
    company_id: 'c1',
    customer_id: 'cust-3',
    customer_name: 'Maria Souza Designer (Revenda)',
    number: 'ORD-0002',
    status: 'aguardando_pagamento',
    total_amount: 240.00,
    paid_amount: 0,
    payment_status: 'pendente',
    shipping_cost: 0,
    deadline: '2026-06-07T12:00:00Z',
    notes: 'Pedido de Revenda. Produção terceirizada de DTF com fornecedor Parceiros DTF Express.',
    items: [
      { id: 'oi-2', product_id: 'prod-4', product_name: 'Cartão de Visita Couché 300g (Milheiro)', quantity: 2, unit_price: 120.00, total_price: 240.00, outsourced: true, supplier_id: 'sup-3', supplier_name: 'Terceirizados DTF Express', outsourced_cost: 45.00 }
    ],
    created_at: '2026-06-01T11:00:00Z'
  },
  {
    id: 'order-3',
    company_id: 'c1',
    customer_id: 'cust-4',
    customer_name: 'Imobiliária Novo Lar',
    number: 'ORD-0003',
    status: 'entregue',
    total_amount: 210.00,
    paid_amount: 210.00,
    payment_status: 'pago',
    shipping_cost: 20.00,
    deadline: '2026-06-02T17:00:00Z',
    notes: 'Entregar com motoqueiro próprio. Cliente pagou integral.',
    items: [
      { id: 'oi-3', product_id: 'prod-5', product_name: 'Camisa Poliéster Branca Estampada', quantity: 5, unit_price: 42.00, total_price: 210.00, outsourced: false }
    ],
    created_at: '2026-05-30T10:00:00Z'
  },
  {
    id: 'order-4',
    company_id: 'c1',
    customer_id: 'cust-2',
    customer_name: 'Academia FitLife',
    number: 'ORD-0004',
    status: 'impressao',
    total_amount: 350.00,
    paid_amount: 350.00,
    payment_status: 'pago',
    shipping_cost: 15.00,
    deadline: '2026-06-06T18:00:00Z',
    notes: 'Imprimir adesivo vinil e recortar com contorno redondo.',
    items: [
      { id: 'oi-4', product_id: 'prod-2', product_name: 'Adesivo Vinil Brilho', quantity: 10, unit_price: 35.00, total_price: 350.00, details: { width: 1, height: 1 }, outsourced: false }
    ],
    created_at: '2026-06-02T13:00:00Z'
  }
];

export const DUMMY_PRODUCTION_QUEUE: ProductionItem[] = [
  {
    id: 'prod-q1',
    company_id: 'c1',
    order_id: 'order-1',
    order_number: 'ORD-0001',
    order_item_id: 'oi-1',
    product_name: 'Banner em Lona 440g',
    quantity: 3,
    status: 'producao',
    priority: 'alta',
    deadline: '2026-06-05T18:00:00Z',
    responsible_name: 'Carlos Impressão',
    started_at: '2026-06-03T08:00:00Z',
    created_at: '2026-05-28T09:10:00Z'
  },
  {
    id: 'prod-q2',
    company_id: 'c1',
    order_id: 'order-4',
    order_number: 'ORD-0004',
    order_item_id: 'oi-4',
    product_name: 'Adesivo Vinil Brilho',
    quantity: 10,
    status: 'impressao',
    priority: 'media',
    deadline: '2026-06-06T18:00:00Z',
    responsible_name: 'Carlos Impressão',
    started_at: '2026-06-03T09:15:00Z',
    created_at: '2026-06-02T13:00:00Z'
  }
];

export const DUMMY_FINANCIAL: FinancialTransaction[] = [
  { id: 'fin-1', company_id: 'c1', order_id: 'order-1', order_number: 'ORD-0001', type: 'receita', category: 'Vendas', amount: 97.50, description: 'Sinal 50% Banner Restaurante Sabor & Arte', payment_method: 'pix', status: 'pago', due_date: '2026-05-28', paid_at: '2026-05-28T09:10:00Z', created_at: '2026-05-28T09:10:00Z' },
  { id: 'fin-2', company_id: 'c1', order_id: 'order-1', order_number: 'ORD-0001', type: 'receita', category: 'Vendas', amount: 97.50, description: 'Restante 50% Banner Restaurante Sabor & Arte', payment_method: 'pix', status: 'pendente', due_date: '2026-06-05', created_at: '2026-05-28T09:10:00Z' },
  { id: 'fin-3', company_id: 'c1', order_id: 'order-3', order_number: 'ORD-0003', type: 'receita', category: 'Vendas', amount: 210.00, description: 'Camisas Poliéster Imobiliária Novo Lar', payment_method: 'cartao_credito', status: 'pago', due_date: '2026-05-30', paid_at: '2026-05-30T10:00:00Z', created_at: '2026-05-30T10:00:00Z' },
  { id: 'fin-4', company_id: 'c1', order_id: 'order-4', order_number: 'ORD-0004', type: 'receita', category: 'Vendas', amount: 350.00, description: 'Adesivos Vinil Academia FitLife', payment_method: 'pix', status: 'pago', due_date: '2026-06-02', paid_at: '2026-06-02T13:00:00Z', created_at: '2026-06-02T13:00:00Z' },
  { id: 'fin-5', company_id: 'c1', type: 'despesa', category: 'Aluguel', amount: 1500.00, description: 'Aluguel do Galpão da Gráfica', payment_method: 'boleto', status: 'pago', due_date: '2026-06-01', paid_at: '2026-06-01T10:00:00Z', created_at: '2026-05-20T10:00:00Z' },
  { id: 'fin-6', company_id: 'c1', type: 'despesa', category: 'Insumos', amount: 480.00, description: 'Compra de Lona e Bastões - Suprimentos Gráficos Brasil', payment_method: 'boleto', status: 'pendente', due_date: '2026-06-10', created_at: '2026-06-01T14:00:00Z' },
  { id: 'fin-7', company_id: 'c1', type: 'despesa', category: 'Salários', amount: 2200.00, description: 'Salário Carlos Impressão', payment_method: 'pix', status: 'pendente', due_date: '2026-06-05', created_at: '2026-06-01T12:00:00Z' }
];

export const DUMMY_SHIPMENTS: Shipment[] = [
  {
    id: 'ship-1',
    company_id: 'c1',
    order_id: 'order-3',
    order_number: 'ORD-0003',
    customer_name: 'Imobiliária Novo Lar',
    status: 'entregue',
    tracking_code: 'RET-0001',
    carrier: 'Retirada Balcão',
    address: { street: 'Alameda Lorena', number: '850', neighborhood: 'Cerqueira César', city: 'São Paulo', state: 'SP', zip_code: '01424-001' },
    delivered_at: '2026-06-02T17:00:00Z',
    created_at: '2026-05-30T10:00:00Z'
  },
  {
    id: 'ship-2',
    company_id: 'c1',
    order_id: 'order-1',
    order_number: 'ORD-0001',
    customer_name: 'Restaurante Sabor & Arte',
    status: 'separacao',
    carrier: 'Entregador Próprio',
    address: { street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', zip_code: '01310-100' },
    created_at: '2026-05-28T09:10:00Z'
  }
];

export const DUMMY_PICKUP_POINTS: PickupPoint[] = [
  { 
    id: 'pick-1', 
    company_id: 'c1', 
    name: 'Matriz Canoas', 
    street: 'R. Rio Negro', 
    number: '744', 
    neighborhood: 'Igara', 
    city: 'Canoas', 
    state: 'RS', 
    hours_week: '8h às 12h / 13h30 às 18h', 
    hours_sat: 'Fechado', 
    active: true,
    address: 'R. Rio Negro, 744 - Igara',
    hours: 'Seg-Sex: 8h às 12h / 13h30 às 18h'
  },
  { 
    id: 'pick-2', 
    company_id: 'c1', 
    name: 'Balcão Floresta (POA)', 
    street: 'R. Voluntários da Pátria', 
    number: '1200', 
    neighborhood: 'Floresta', 
    city: 'Porto Alegre', 
    state: 'RS', 
    hours_week: '9h às 12h / 13h30 às 17h30', 
    hours_sat: 'Fechado', 
    active: true,
    address: 'R. Voluntários da Pátria, 1200',
    hours: 'Seg-Sex: 9h às 12h / 13h30 às 17h30'
  },
  { 
    id: 'pick-3', 
    company_id: 'c1', 
    name: 'Balcão Campinas', 
    street: 'Av. Francisco Glicério', 
    number: '1500', 
    neighborhood: 'Centro', 
    city: 'Campinas', 
    state: 'SP', 
    hours_week: '8h30 às 18h', 
    hours_sat: 'Fechado', 
    active: true,
    address: 'Av. Francisco Glicério, 1500 - Centro',
    hours: 'Seg-Sex: 8h30 às 18h'
  }
];

export const DUMMY_SETTINGS = {
  theme: 'dark',
  pix_key: 'financeiro@printflowpro.com.br',
  pix_key_type: 'email',
  bank_name: 'Banco Sicoob',
  tax_rate: 6.0,
  commission_rate: 5.0,
  top_bar_hours: 'Segunda à Sexta: 8h às 12h / 13h30 às 18h',
  top_bar_show_pickup: true,
  top_bar_phone: '(51) 98765-4321',
  footer_show_address: true,
  footer_hours_message: '*Atendimento presencial com hora marcada*',
  footer_hours_week: '8h às 12h / 13h30 às 18h',
  footer_hours_sat: 'Segunda à Sexta-feira',
  footer_hours_sat_time: 'Fechado',
  footer_hours_sat_desc: 'Sábado',
  saas_enabled: true,
  nfe_enabled: false,
  ai_enabled: false,
  company_address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
  delivery_motoboy_price_km: 2.50,
  delivery_car_price_km: 4.50,
  delivery_min_fee: 10.00
};
