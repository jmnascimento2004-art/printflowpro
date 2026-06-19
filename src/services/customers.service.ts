import { supabase } from '@/lib/supabaseClient';
import type { Customer } from '@/lib/dummy-data';

export type NewCustomerInput = Omit<Customer, 'id' | 'company_id' | 'created_at'>;

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
  const { error } = await supabase.from('customers').insert(customer);

  if (error) throw error;

  return customer;
};

export const updateCustomerRecord = async (customer: Customer) => {
  const { error } = await supabase
    .from('customers')
    .update(customer)
    .eq('id', customer.id);

  if (error) throw error;

  return customer;
};

export const deleteCustomerRecord = async (id: string) => {
  const { error } = await supabase.from('customers').delete().eq('id', id);

  if (error) throw error;
};

export const deleteAllCustomers = async () => {
  const { error } = await supabase.from('customers').delete().not('id', 'is', null);

  if (error) throw error;
};
