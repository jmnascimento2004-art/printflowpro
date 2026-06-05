-- PRINTFLOWPRO - DATABASE SCHEMA
-- Target Database: PostgreSQL (Supabase Compatible)

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPANIES (Tenants)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(50), -- CNPJ
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- 2. PROFILES (Users associated with companies)
CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Maps to auth.users id in Supabase
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'vendas' NOT NULL, -- 'admin', 'financeiro', 'producao', 'vendas', 'estoque'
    active BOOLEAN DEFAULT TRUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. CUSTOMERS
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    document VARCHAR(50), -- CPF or CNPJ
    phone VARCHAR(50), -- WhatsApp
    email VARCHAR(255),
    address JSONB, -- { street, number, neighborhood, city, state, zip_code }
    tags TEXT[], -- e.g. ['VIP', 'Revendedor', 'Inadimplente']
    notes TEXT,
    billing_type VARCHAR(50) DEFAULT 'imediato' NOT NULL, -- 'imediato', 'faturado'
    credit_limit DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    credit_used DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    payment_terms_days INTEGER DEFAULT 30 NOT NULL,
    credit_status VARCHAR(50) DEFAULT 'aprovado' NOT NULL, -- 'aprovado', 'bloqueado', 'sob_analise'
    corporate_additional_info JSONB, -- { inscricao_estadual, nome_fantasia, responsavel_financeiro_nome, responsavel_financeiro_phone, responsavel_financeiro_email }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 4. SUPPLIERS
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- 5. CATEGORIES
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 6. PRODUCTS
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100),
    pricing_type VARCHAR(50) DEFAULT 'unidade' NOT NULL, -- 'unidade', 'm2', 'linear', 'pacote', 'kit'
    base_cost DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    sales_price DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    stock_controlled BOOLEAN DEFAULT TRUE NOT NULL,
    min_stock DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 7. PRICING DETAILS (Detailed cost analysis for pricing engine)
CREATE TABLE pricing_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE NOT NULL,
    raw_material_cost DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    operating_cost DECIMAL(12, 2) DEFAULT 0.00 NOT NULL, -- Cost of labor and machine runtime
    production_time INTEGER DEFAULT 0 NOT NULL, -- in minutes
    markup DECIMAL(5, 2) DEFAULT 0.00 NOT NULL, -- markup multiplier or margin percent
    commission DECIMAL(5, 2) DEFAULT 0.00 NOT NULL, -- commission percent
    taxes DECIMAL(5, 2) DEFAULT 0.00 NOT NULL, -- tax percent
    waste_percent DECIMAL(5, 2) DEFAULT 0.00 NOT NULL, -- expected waste
    calculated_price DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for pricing_details
ALTER TABLE pricing_details ENABLE ROW LEVEL SECURITY;

-- 8. QUOTES
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    number SERIAL NOT NULL,
    status VARCHAR(50) DEFAULT 'rascunho' NOT NULL, -- 'rascunho', 'pendente', 'aprovado', 'reprovado'
    total_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    discount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- 9. QUOTE ITEMS
CREATE TABLE quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    details JSONB -- Stores width, height, custom choices, material variables
);

-- Enable RLS for quote_items
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- 10. ORDERS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    number VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'aguardando_aprovacao' NOT NULL, 
    -- 'orcamento', 'aguardando_aprovacao', 'aguardando_pagamento', 'producao', 'impressao', 'acabamento', 'expedicao', 'entregue', 'finalizado', 'cancelado'
    total_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    paid_amount DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pendente' NOT NULL, -- 'pendente', 'parcial', 'pago', 'reembolsado'
    shipping_cost DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 11. ORDER ITEMS
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    details JSONB, -- Stores custom size (width, height), material notes
    outsourced BOOLEAN DEFAULT FALSE NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    outsourced_cost DECIMAL(12, 2) DEFAULT 0.00
);

-- Enable RLS for order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 12. PRODUCTION QUEUE
CREATE TABLE production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'fila' NOT NULL, -- 'fila', 'producao', 'impressao', 'acabamento', 'concluido'
    priority VARCHAR(50) DEFAULT 'media' NOT NULL, -- 'baixa', 'media', 'alta'
    deadline TIMESTAMP WITH TIME ZONE,
    responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for production
ALTER TABLE production ENABLE ROW LEVEL SECURITY;

-- 13. FINANCIAL TRANSACTIONS
CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'receita', 'despesa'
    category VARCHAR(255) NOT NULL, -- 'Venda', 'Compra Insumos', 'Salários', 'Infraestrutura', etc.
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) NOT NULL, -- 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro'
    status VARCHAR(50) DEFAULT 'pendente' NOT NULL, -- 'pendente', 'pago'
    due_date DATE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for financial_transactions
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

-- 14. STOCK MOVEMENTS
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'entrada', 'saida'
    quantity DECIMAL(12, 2) NOT NULL,
    reason TEXT, -- 'Compra', 'Uso Produção', 'Ajuste Inventário', 'Venda'
    unit_cost DECIMAL(12, 2), -- Cost at time of movement
    reference_id UUID, -- order_id or supplier invoice reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 15. SHIPMENTS
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'separacao' NOT NULL, -- 'separacao', 'embalagem', 'enviado', 'entregue'
    tracking_code VARCHAR(100),
    carrier VARCHAR(100), -- 'Correios', 'Jadlog', 'Retirada Balcão', 'Entregador Próprio'
    address JSONB NOT NULL,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for shipments
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- 16. PIX PAYMENTS
CREATE TABLE pix_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    qr_code TEXT NOT NULL,
    copia_e_cola TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pendente' NOT NULL, -- 'pendente', 'pago', 'expirado'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS for pix_payments
ALTER TABLE pix_payments ENABLE ROW LEVEL SECURITY;

-- 17. SETTINGS
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE NOT NULL,
    config JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS for settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enforce company partitioning for multi-tenant SaaS scaling.
-- =========================================================================

-- Helper Function to retrieve current user's company_id
-- In production, profile is fetched from auth metadata or a secure function:
-- CREATE OR REPLACE FUNCTION get_user_company_id() 
-- RETURNS UUID AS $$
--   SELECT company_id FROM profiles WHERE id = auth.uid();
-- $$ LANGUAGE sql SECURITY DEFINER;

-- For migration purposes, policies check profile company mapping:

-- Example Profile policy
CREATE POLICY profile_same_company ON profiles
    FOR ALL
    USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Example Customer policy
CREATE POLICY customer_same_company ON customers
    FOR ALL
    USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Repeat similar templates for all tables...
