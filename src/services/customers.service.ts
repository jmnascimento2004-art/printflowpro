import { supabase } from '@/lib/supabaseClient';
import type { Customer } from '@/lib/dummy-data';
import { deleteTenantRecord, insertTenantRecord, patchTenantRecord } from '@/lib/persistence/persistence-service';

export type NewCustomerInput = Omit<Customer, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

const makeCustomerId = (customer: NewCustomerInput) => {
  const customerIdPrefix = customer.tags?.includes('Catalogo Online') ? 'cust-web' : 'cust';
  return `${customerIdPrefix}-${Date.now()}`;
};

export const listCustomers = async (companyId?: string) => {
  let query = supabase.from('customers').select('*');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []) as Customer[];
};

export const buildCustomerRecord = (customer: NewCustomerInput, companyId: string): Customer => ({
  ...customer,
  id: makeCustomerId(customer),
  company_id: companyId,
  created_at: new Date().toISOString()
});

export const createCustomer = async (customer: Customer) => {
  return insertTenantRecord<Customer>('customers', customer);
};

export const updateCustomerRecord = async (customer: Customer, previous: Customer) => {
  const patch = Object.fromEntries(Object.entries(customer).filter(([key, value]) => (
    !['id', 'company_id', 'created_at', 'updated_at'].includes(key)
    && JSON.stringify(value) !== JSON.stringify((previous as unknown as Record<string, unknown>)[key])
  )));
  if (Object.keys(patch).length === 0) return previous;
  return patchTenantRecord<Customer>('customers', customer.id, previous.company_id, patch, {
    expectedUpdatedAt: previous.updated_at
  });
};

export const deleteCustomerRecord = async (customer: Customer) => {
  await deleteTenantRecord('customers', customer.id, customer.company_id, {
    expectedUpdatedAt: customer.updated_at
  });
};

export const deleteAllCustomers = async () => {
  const { error } = await supabase.from('customers').delete().not('id', 'is', null);

  if (error) throw error;
};
