export interface TenantCustomerIdentity {
  id: string;
  company_id: string;
}

export function findExactTenantCustomer<T extends TenantCustomerIdentity>(
  customers: readonly T[],
  customerId: string | null | undefined,
  trustedCompanyId: string | null | undefined
): T | null {
  if (!customerId || !trustedCompanyId) return null;
  return customers.find((customer) => (
    customer.id === customerId && customer.company_id === trustedCompanyId
  )) || null;
}
