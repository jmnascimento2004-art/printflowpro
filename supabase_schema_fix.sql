-- PRINTFLOWPRO - CORREÇÃO DE SCHEMA SUPABASE
-- Este script limpa o banco de dados e recria todas as tabelas usando tipo TEXT para IDs,
-- garantindo compatibilidade com os prefixos gerados pelo Next.js (Ex: 'c1', 'cust-XXXX', 'prod-XXXX').
-- Além disso, desabilita o RLS (Row Level Security) para permitir que o cliente do frontend
-- grave e leia dados diretamente usando a chave anônima (sem necessidade de Supabase Auth).

-- =====================================================================
-- 1. LIMPEZA DO BANCO DE DADOS (DROPS EM CASCATA)
-- =====================================================================
DROP TABLE IF EXISTS cash_register_transactions CASCADE;
DROP TABLE IF EXISTS cash_register_sessions CASCADE;
DROP TABLE IF EXISTS store_banners CASCADE;
DROP TABLE IF EXISTS pickup_points CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS financial_transactions CASCADE;
DROP TABLE IF EXISTS production_queue CASCADE;
DROP TABLE IF EXISTS production CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS quote_items CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS pricing_details CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS pix_payments CASCADE;

-- Enable UUID extension for auto-generating UUID strings if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger de atualização automática do campo updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. TABELA: COMPANIES (EMPRESAS / Tenants)
-- =====================================================================
CREATE TABLE companies (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  logo_url TEXT,
  logo_light TEXT,
  logo_dark TEXT,
  favicon TEXT,
  phone TEXT,
  email TEXT,
  cep TEXT,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  state VARCHAR(2),
  theme_color TEXT DEFAULT 'emerald',
  instagram_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,
  refund_policy TEXT,
  
  -- Toggles de Pagamento
  show_payments_visa BOOLEAN DEFAULT TRUE,
  show_payments_mastercard BOOLEAN DEFAULT TRUE,
  show_payments_elo BOOLEAN DEFAULT TRUE,
  show_payments_hipercard BOOLEAN DEFAULT TRUE,
  show_payments_diners BOOLEAN DEFAULT TRUE,
  show_payments_amex BOOLEAN DEFAULT TRUE,
  show_payments_boleto BOOLEAN DEFAULT TRUE,
  show_payments_deposito BOOLEAN DEFAULT TRUE,
  show_payments_transferencia BOOLEAN DEFAULT TRUE,
  show_payments_pix BOOLEAN DEFAULT TRUE,
  
  -- Toggles de Entrega
  show_delivery_sedex BOOLEAN DEFAULT TRUE,
  show_delivery_pac BOOLEAN DEFAULT TRUE,
  show_delivery_correios BOOLEAN DEFAULT TRUE,
  show_delivery_jadlog BOOLEAN DEFAULT TRUE,
  show_delivery_motoboy BOOLEAN DEFAULT TRUE,
  
  -- Toggles de Segurança
  show_security_letsencrypt BOOLEAN DEFAULT TRUE,
  show_security_google BOOLEAN DEFAULT TRUE,
  
  -- Cards de Benefícios
  card_benefits_1_title TEXT DEFAULT 'Até 4x Sem Juros',
  card_benefits_1_subtitle TEXT,
  card_benefits_1_active BOOLEAN DEFAULT TRUE,
  card_benefits_2_title TEXT DEFAULT 'Desconto no PIX',
  card_benefits_2_subtitle TEXT,
  card_benefits_2_active BOOLEAN DEFAULT TRUE,
  card_benefits_3_title TEXT DEFAULT 'Frete para todo Brasil',
  card_benefits_3_subtitle TEXT,
  card_benefits_3_active BOOLEAN DEFAULT TRUE,
  card_benefits_4_title TEXT DEFAULT 'Pontos de Coleta',
  card_benefits_4_subtitle TEXT,
  card_benefits_4_active BOOLEAN DEFAULT TRUE,
  
  -- Imagens customizadas dos badges (Base64 / URL)
  img_payments_visa TEXT,
  img_payments_mastercard TEXT,
  img_payments_elo TEXT,
  img_payments_hipercard TEXT,
  img_payments_diners TEXT,
  img_payments_amex TEXT,
  img_payments_boleto TEXT,
  img_payments_transferencia TEXT,
  img_payments_pix TEXT,
  img_delivery_sedex TEXT,
  img_delivery_pac TEXT,
  img_delivery_correios TEXT,
  img_delivery_jadlog TEXT,
  img_delivery_motoboy TEXT,
  img_security_letsencrypt TEXT,
  img_security_google TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_timestamp_companies
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 3. TABELA: SETTINGS (CONFIGURAÇÕES GERAIS DO SaaS)
-- =====================================================================
CREATE TABLE settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  pix_key TEXT,
  pix_key_type TEXT,
  bank_name TEXT,
  tax_rate NUMERIC(5,2) DEFAULT 6.00,
  commission_rate NUMERIC(5,2) DEFAULT 5.00,
  top_bar_hours TEXT,
  top_bar_show_pickup BOOLEAN DEFAULT TRUE,
  top_bar_phone TEXT,
  footer_show_address BOOLEAN DEFAULT TRUE,
  footer_hours_message TEXT,
  footer_hours_week TEXT,
  footer_hours_sat TEXT,
  footer_hours_sat_time TEXT,
  footer_hours_sat_desc TEXT,
  saas_enabled BOOLEAN DEFAULT TRUE,
  nfe_enabled BOOLEAN DEFAULT FALSE,
  ai_enabled BOOLEAN DEFAULT FALSE,
  company_address TEXT,
  delivery_motoboy_price_km NUMERIC(10,2) DEFAULT 2.50,
  delivery_car_price_km NUMERIC(10,2) DEFAULT 4.50,
  delivery_min_fee NUMERIC(10,2) DEFAULT 10.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_timestamp_settings
BEFORE UPDATE ON settings
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 4. TABELA: PROFILES (COLABORADORES / USUÁRIOS)
-- =====================================================================
CREATE TABLE profiles (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'gerente', 'financeiro', 'vendas', 'producao', 'estoque', 'arte_finalista')),
  active BOOLEAN DEFAULT TRUE,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_company ON profiles(company_id);

CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 5. TABELA: ROLE_PERMISSIONS (CONTROLE DE ACESSO)
-- =====================================================================
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  roles TEXT[] NOT NULL, -- Array de strings contendo cargos permitidos
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_role_perms_company_path ON role_permissions(company_id, path);

-- =====================================================================
-- 6. TABELA: CUSTOMERS (CLIENTES - CRM)
-- =====================================================================
CREATE TABLE customers (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb, -- Armazena { street, number, neighborhood, city, state, zip_code }
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  billing_type TEXT DEFAULT 'imediato' CHECK (billing_type IN ('imediato', 'faturado')),
  credit_limit NUMERIC(12,2) DEFAULT 0.00,
  credit_used NUMERIC(12,2) DEFAULT 0.00,
  payment_terms_days INTEGER DEFAULT 30,
  credit_status TEXT DEFAULT 'aprovado' CHECK (credit_status IN ('aprovado', 'bloqueado', 'sob_analise')),
  corporate_additional_info JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_name ON customers(name);

CREATE TRIGGER set_timestamp_customers
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 7. TABELA: SUPPLIERS (FORNECEDORES)
-- =====================================================================
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_suppliers_company ON suppliers(company_id);

CREATE TRIGGER set_timestamp_suppliers
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 8. TABELA: CATEGORIES (CATEGORIAS)
-- =====================================================================
CREATE TABLE categories (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_categories_company ON categories(company_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TRIGGER set_timestamp_categories
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 9. TABELA: PRODUCTS (PRODUTOS)
-- =====================================================================
CREATE TABLE products (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('unidade', 'm2', 'linear', 'pacote', 'kit')),
  base_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  sales_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  stock_controlled BOOLEAN DEFAULT FALSE,
  min_stock NUMERIC(10,2) DEFAULT 0.00,
  current_stock NUMERIC(10,2) DEFAULT 0.00,
  active BOOLEAN DEFAULT TRUE,
  pricing_details JSONB DEFAULT '{}'::jsonb,
  image_url TEXT,
  volume_pricing JSONB DEFAULT '[]'::jsonb,
  is_promo BOOLEAN DEFAULT FALSE,
  is_highlight BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_sku ON products(company_id, sku);

CREATE TRIGGER set_timestamp_products
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 10. TABELA: QUOTES (ORÇAMENTOS)
-- =====================================================================
CREATE TABLE quotes (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  number SERIAL,
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'pendente', 'aprovado', 'reprovado')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(12,2) DEFAULT 0.00,
  valid_until DATE,
  notes TEXT,
  
  -- Logística
  delivery_type TEXT CHECK (delivery_type IN ('retirada', 'motoboy', 'carro', 'correios')),
  delivery_address TEXT,
  delivery_distance_km NUMERIC(8,2) DEFAULT 0.00,
  delivery_fee NUMERIC(12,2) DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_quotes_company ON quotes(company_id);

CREATE TRIGGER set_timestamp_quotes
BEFORE UPDATE ON quotes
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 11. TABELA: QUOTE_ITEMS (ITENS DO ORÇAMENTO)
-- =====================================================================
CREATE TABLE quote_items (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quote_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);

-- =====================================================================
-- 12. TABELA: ORDERS (PEDIDOS / ORDENS DE SERVIÇO)
-- =====================================================================
CREATE TABLE orders (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT DEFAULT 'orcamento' CHECK (status IN ('orcamento', 'aguardando_aprovacao', 'aguardando_pagamento', 'producao', 'impressao', 'acabamento', 'expedicao', 'entregue', 'finalizado', 'cancelado')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12,2) DEFAULT 0.00,
  payment_status TEXT DEFAULT 'pendente' CHECK (payment_status IN ('pendente', 'parcial', 'pago', 'reembolsado')),
  shipping_cost NUMERIC(12,2) DEFAULT 0.00,
  deadline TIMESTAMPTZ,
  notes TEXT,
  
  -- Logística
  delivery_type TEXT CHECK (delivery_type IN ('retirada', 'motoboy', 'carro', 'correios')),
  delivery_address TEXT,
  delivery_distance_km NUMERIC(8,2) DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_number ON orders(company_id, number);

CREATE TRIGGER set_timestamp_orders
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 13. TABELA: ORDER_ITEMS (ITENS DO PEDIDO)
-- =====================================================================
CREATE TABLE order_items (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  details JSONB DEFAULT '{}'::jsonb,
  
  -- Terceirização
  outsourced BOOLEAN DEFAULT FALSE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  outsourced_cost NUMERIC(12,2) DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- =====================================================================
-- 14. TABELA: PRODUCTION_QUEUE (FILA DE PRODUÇÃO KANBAN)
-- =====================================================================
CREATE TABLE production_queue (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  status TEXT DEFAULT 'fila' CHECK (status IN ('fila', 'producao', 'impressao', 'acabamento', 'concluido')),
  priority TEXT DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
  deadline TIMESTAMPTZ,
  responsible_name TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE production_queue DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_production_company ON production_queue(company_id);
CREATE INDEX idx_production_status ON production_queue(company_id, status);

CREATE TRIGGER set_timestamp_production
BEFORE UPDATE ON production_queue
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 15. TABELA: FINANCIAL_TRANSACTIONS (LIVRO CAIXA)
-- =====================================================================
CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  order_number TEXT,
  type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  description TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'faturado')),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financial_transactions DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_financial_company ON financial_transactions(company_id);

CREATE TRIGGER set_timestamp_financial
BEFORE UPDATE ON financial_transactions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 16. TABELA: STOCK_MOVEMENTS (ESTOQUE)
-- =====================================================================
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  unit_cost NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_stock_movements_company ON stock_movements(company_id);

-- =====================================================================
-- 17. TABELA: SHIPMENTS (ENTREGAS)
-- =====================================================================
CREATE TABLE shipments (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  status TEXT DEFAULT 'separacao' CHECK (status IN ('separacao', 'embalagem', 'enviado', 'entregue')),
  tracking_code TEXT,
  carrier TEXT NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shipments DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shipments_company ON shipments(company_id);

CREATE TRIGGER set_timestamp_shipments
BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 18. TABELA: PICKUP_POINTS (PONTOS DE COLETA)
-- =====================================================================
CREATE TABLE pickup_points (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state VARCHAR(2) NOT NULL,
  hours_week TEXT NOT NULL,
  hours_sat TEXT,
  active BOOLEAN DEFAULT TRUE,
  address TEXT,
  hours TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pickup_points DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pickup_company ON pickup_points(company_id);

CREATE TRIGGER set_timestamp_pickups
BEFORE UPDATE ON pickup_points
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 19. TABELA: STORE_BANNERS (BANNERS DO CATÁLOGO)
-- =====================================================================
CREATE TABLE store_banners (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE store_banners DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_banners_company ON store_banners(company_id);

-- =====================================================================
-- 20. TABELA: CASH_REGISTER_SESSIONS (SESSÕES DE CAIXA)
-- =====================================================================
CREATE TABLE cash_register_sessions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opened_by TEXT NOT NULL,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  actual_cash NUMERIC(12,2),
  difference NUMERIC(12,2),
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cash_register_sessions DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_company ON cash_register_sessions(company_id);

CREATE TRIGGER set_timestamp_sessions
BEFORE UPDATE ON cash_register_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- =====================================================================
-- 21. TABELA: CASH_REGISTER_TRANSACTIONS (LANÇAMENTOS DE CAIXA)
-- =====================================================================
CREATE TABLE cash_register_transactions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  session_id TEXT NOT NULL REFERENCES cash_register_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('abertura', 'fechamento', 'venda', 'suprimento', 'sangria')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  description TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cash_register_transactions DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_register_trans_session ON cash_register_transactions(session_id);
