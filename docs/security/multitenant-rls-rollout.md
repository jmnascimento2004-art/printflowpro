# Multitenant RLS rollout

## Access matrix

| Class | Tables | Anonymous | Authenticated |
| --- | --- | --- | --- |
| Private tenant | customers, suppliers, quotes, orders, production, finance, stock, shipments, cash register | none | own company only |
| Public catalog base | companies, settings, categories, products, pickup points, banners | none | own company only |
| Store customer | customer accounts, addresses, favorites, own orders/quotes | narrow existing policies | own account only |
| Privacy | consents, cookie preferences, requests, policy versions | narrow existing policies | existing self policies |
| Technical | profiles, permissions | none | current profile/company and role rules |

Public catalog reads go through server routes using a server-only service-role client. Routes keep host-based tenant resolution and explicit DTO field lists.

## Rollout order

1. Configure `SUPABASE_SERVICE_ROLE_KEY` only in the server runtime.
2. Deploy server-route changes before revoking anonymous table access.
3. Apply helper hardening, grant revocation, RLS policies, RPC restrictions, then default privileges.
4. Verify anonymous denial, authenticated tenant isolation, public DTOs, admin workflows, and PDFs.

The remote audit also found broad defaults owned by `supabase_admin`. The normal migration executor cannot alter that owner's defaults; they require a separate platform-admin operation and must be re-audited after rollout.

## Rollback

- Keep RLS enabled. Replace only a problematic policy.
- Restore authenticated privileges only for the affected table; never restore anonymous base-table CRUD.
- If the catalog route fails, roll back the server deployment or fix its server secret. Do not grant anonymous base-table access.
- Reverse default privileges only for a specific required role/object type, followed by explicit grants and RLS.
