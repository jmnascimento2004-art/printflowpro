# Phase 11E — SaaS Billing (QA)

Base: `76b9cee9bb45d36e3b75dbf7efbc364a87459220`. Branch: `feat/phase11e-saas-billing`.

## Scope and existing architecture

`companies.id` is the canonical tenant. Active `profiles.auth_user_id` binds the authenticated user to that tenant; the admin profile and `/settings` permission authorize subscription management. Existing permissions and the legacy `settings.saas_enabled` flag are not subscriptions. No recurring billing provider, plan catalog, entitlement resolver or platform administrator role existed. No global administrator UI or SaaS metrics were exposed to tenant administrators.

The user selected the mock provider and demonstration plans. Real recurring billing is hard disabled, no card data is collected, and no SaaS action writes operational Finance. Existing tenants remain unmanaged, with their current access, until explicitly enrolled in the private QA allowlist. The real company must not be enrolled for this validation. The user will create a separate account/company through Preview signup.

## Catalog and contracts

The database supplies plan names, codes, prices, features, quotas, order and trial length. Seeded examples are **not commercial offers**:

| Code | Monthly QA | Annual QA | Trial | Users / Products | Features |
| --- | --- | --- | --- | --- | --- |
| qa-essential | BRL 29 | BRL 290 | 7 days | 2 / 2 | Catalog, Finance |
| qa-complete | BRL 59 | BRL 590 | 7 days | 10 / 100 | Catalog, Finance, Reports, Commissions, Payment Links, Fiscal QA, Advanced Media |

Catalog configuration uses a service-only RPC with optimistic revision checks. No tenant can configure global plans. Plan modifications have an immutable private service audit. Each subscription snapshots the accepted plan conditions: editing a catalog plan does not silently change an existing contract. A stale plan revision requires the user to refresh before accepting changed conditions. Client-provided prices, statuses, features or quotas are rejected.

## Lifecycle and calendar policy

One subscription row exists per company. States: trial, active, past_due, grace, cancelled, expired. A single resolver derives elapsed trial, grace and scheduled cancellation from server time; no browser timer authorizes writes. QA actions produce immutable subscription events and tenant Audit Log entries.

Trial may be used once per company. Activation starts a fresh monthly/yearly period and records the paid billing day; it does not use the earlier trial-start day. Renewals preserve the previous due date and the paid calendar anchor, including late payment in grace. January 31 clamps to February 28/29 and then returns to March 31. Expired/cancelled subscriptions require reactivation, which starts a fresh period and day anchor. A future real provider must supply authoritative payment confirmation and its own documented renewal policy.

Upgrade/downgrade and cycle changes are immediate QA changes to conditions. The existing due date remains unchanged; the newly chosen cycle is used at the next renewal. No monetary proration is implemented. Downgrade never deletes excess data. New product/active-profile additions are denied at quota; existing edits remain possible while writable. Usage counts canonical products (including inactive records) and active profiles. No storage quota or estimated parallel counter is introduced.

Cancellation is scheduled at the period end. Reactivation before that end reverses the flag and preserves the period. Payment failure enters past_due and the central 3-day grace policy; QA can explicitly simulate grace and the end of a deadline. Time expiration is derived at access time even without a background job. The historical event stream records confirmed QA commands, not fabricated periodic clock events.

## Enforcement and authorization

Database triggers enforce read-only, entitlements and quotas on tenant public tables, including order/quote children and cash transactions resolved through their parent session. A tenant advisory lock serializes quota checks. Triggers use a nonblocking lock attempt with SQLSTATE 40001 for safe retry rather than waiting after acquiring a row lock. Existing tenants without a subscription retain their previous behavior.

User permission and entitlement are separate. Canonical operation RPCs retain their established authorization: a seller allowed to receive an order or operate POS does not gain an additional Finance-module permission requirement for the ledger rows produced by that authorized operation. Restrictive INSERT/UPDATE/DELETE policies check user permissions for direct REST writes in managed tenants. Explicit configured role denial is respected, including for administrators. Billing itself requires an active admin with Settings permission.

Paid source RPCs enforce entitlements before invoking the original authorized source. Private original functions are not browser-callable. Checkout and product review mutations also check the canonical write resolver. Upload checks the JWT-bound tenant at the API and again at the service-only private media registry boundary. Product media comparisons normalize empty arrays/text so an ordinary commercial edit does not falsely require advanced media.

After expiry/cancellation, new operations and mutations are denied, while authenticated login, history, critical report/export queries and the subscription portal remain available. Existing source RPC role checks remain in effect for historical access. The UI warns about read-only/grace and shows unavailable feature pages discreetly; server/database checks remain authoritative. Background access refresh does not remount editors or erase in-progress form input.

## Mock adapter and callbacks

The adapter exposes createCustomer, createSubscription, changePlan, cancelSubscription, getSubscription and parseWebhook without a payment network client. Each command is prepared under the authenticated tenant, actor, expected subscription revision and immutable operation UUID. The mock generates a bounded QA event. Only a service-authorized callback can apply that already-prepared command.

HMAC-SHA256 covers timestamp plus raw body with constant-time comparison, a 5-minute freshness window, strict bounded JSON schema and a private database-generated secret. The webhook response contains no subscription data. Duplicate callbacks return duplicate without another renewal; stale revisions return stale and cannot revert a newer state. Retries keep the same operation key and payload. QA actions are allowlisted per tenant and recheck the actor permission on callback.

## Validation evidence (pre-Preview)

- 90 focused pgTAP checks: lifecycle, time resolution, monthly/annual calendar, quota, cross-tenant RLS, price tampering, real billing refusal, permission AND entitlement, private media/checkout, snapshot conditions, global catalog configuration/audit, duplicate/replay/stale events.
- Five provider tests; full Node suite: 738 passed.
- Full pgTAP suite, typecheck, lint, build and independent review are release gates. Lint baseline: 19 warnings, zero errors.
- Two real local database connections reproduced the prior product row/advisory lock conflict and confirmed retryable 40001 without deadlock.
- Benchmark gap-analysis document remains unchanged (SHA256 `3D66CCB8DBA44A727FE8AC608313CC4087BDCE81C515124139826BB887943D8F`).

Preview responsive/lifecycle evidence, QA tenant identity, migration version, PR/checks and final Production smoke must be recorded before PASS. No PASS is claimed by this document alone.

## Future real activation requirements

Explicit new authorization; commercial plan approval; provider selection/contract and credential provisioning; authenticated platform administration with separate role; verified live event mapping; customer identity and payment mandates; renewal/retry/refund/dunning/proration/tax policies; monitoring, reconciliation and incident/rollback procedures. QA mode cannot be switched to real billing through tenant settings, request payloads or a browser flag. Phase 11F is not started here.
