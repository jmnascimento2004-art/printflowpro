-- Additional services are commercial charges kept separate from physical products.
-- They must not create stock, production, shipment or material movement records.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS additional_services JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS additional_services JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS company_default_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_default_services_company
  ON company_default_services(company_id);

ALTER TABLE company_default_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_default_services_select ON company_default_services;
DROP POLICY IF EXISTS company_default_services_insert ON company_default_services;
DROP POLICY IF EXISTS company_default_services_update ON company_default_services;
DROP POLICY IF EXISTS company_default_services_delete ON company_default_services;

CREATE POLICY company_default_services_select
  ON company_default_services
  FOR SELECT
  USING (company_id = private.current_company_id());

CREATE POLICY company_default_services_insert
  ON company_default_services
  FOR INSERT
  WITH CHECK (company_id = private.current_company_id());

CREATE POLICY company_default_services_update
  ON company_default_services
  FOR UPDATE
  USING (company_id = private.current_company_id())
  WITH CHECK (company_id = private.current_company_id());

CREATE POLICY company_default_services_delete
  ON company_default_services
  FOR DELETE
  USING (company_id = private.current_company_id());

DROP TRIGGER IF EXISTS set_timestamp_company_default_services ON company_default_services;

CREATE TRIGGER set_timestamp_company_default_services
BEFORE UPDATE ON company_default_services
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
