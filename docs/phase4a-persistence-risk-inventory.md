# Phase 4A — Persistence risk inventory

This inventory records persistence sources discovered during the Phase 4A audit. It is deliberately broader than the production fix, but only the production queue is remediated in this phase.

Classification:

- **A — canonical persistent:** database-backed business state with explicit writes.
- **B — ephemeral UI:** component state used only for forms, filters, pending state or presentation.
- **C — isolated demo/fallback:** dummy or local snapshots guarded by the explicit demo fallback.
- **D — client snapshot persistence risk:** a browser state collection can rewrite persistent rows in bulk.
- **E — display/default fallback:** defaults used for rendering or incomplete configuration, not intended as business history.
- **F — local privacy/session preference:** local browser data that must remain non-authoritative and privacy-scoped.

| Class | Module / file | Data | Current source | Risk | Recommendation |
|---|---|---|---|---|---|
| A | `src/context/database-context.tsx` | orders, quotes and their items | atomic database RPCs | Low for the atomic flows | Keep database responses authoritative and expand this pattern when adjacent modules are revisited. |
| A | `src/lib/production/production-service.ts` | production stage | `transition_production_stage` RPC with `updated_at` compare-and-swap | Low after Phase 4A | Keep stage writes exclusively behind the RPC so every accepted transition has an audit event. |
| A | `src/lib/production/production-service.ts` | initial queue rows | `ensure_production_queue_for_order` idempotent RPC | Low after Phase 4A | Derive the initial stage once, when the row is created; never recalculate it from the order later. |
| B | `src/app/(dashboard)/production/page.tsx` | search, dragging and per-item pending state | React state | Low | Keep ephemeral; never persist these values. |
| B | dashboard forms (`orders`, `quotes`, `products`, `financial`, `stock`, `settings`) | draft form fields and filters | React state | Low while save handlers remain explicit | Continue separating form drafts from accepted database rows. |
| C | `src/context/database/demo-storage.ts` and `src/context/database-context.tsx` | demo snapshots, including dummy production rows | localStorage only when the explicit demo fallback is enabled | Medium if the guard regresses | Keep disabled in real tenant sessions and test that production persistence never consumes a demo snapshot. |
| C | `src/lib/dummy-data.ts` | seeded examples/default objects | bundled dummy constants | Medium if mistaken for tenant data | Restrict to demo/test/bootstrap presentation; never upsert automatically for an authenticated tenant. |
| D | `src/context/database-context.tsx` | suppliers, categories, products, financial, shipments, stock, permissions, cash sessions | effects that bulk-upsert the current React collection | High in multi-tab scenarios | Out of Phase 4A scope. Migrate module-by-module to explicit server mutations with concurrency control. |
| D (resolved) | former production persistence effect in `src/context/database-context.tsx` | full `production_queue` snapshot | every React production change triggered `upsert(production)` | High: a stale tab could overwrite a newer persisted stage | Removed in Phase 4A. Realtime rows and RPC responses now update the client mirror. |
| D (resolved) | former order-derived production effect and `updateOrderStatus` | queue row creation and final status | client derivation from order state | High: orders could recreate or overwrite the canonical stage | Removed in Phase 4A. Orders may trigger idempotent initial creation, but cannot overwrite an existing queue stage. |
| D (resolved) | former `assignProductionResponsible` | responsible and production stage | local mutation silently changed `fila` to `producao` | High: undocumented transition without audit | Assignment now changes only `responsible_name`, with optimistic rollback and version check. |
| E | `mergeSettingsWithDefaults` in `src/context/database-context.tsx` | settings display defaults | `DUMMY_SETTINGS` plus remote settings | Medium if a default is saved unintentionally | Keep defaults presentation-only and require explicit user save for persistence. |
| E | PDF/branding/store resolver helpers | textual/image fallbacks | remote row first, neutral fallback second | Low | Keep fallbacks neutral and never write them back implicitly. |
| F | `src/context/theme-context.tsx` | theme preference | localStorage | Low | Keep local and non-business. |
| F | `src/context/store-privacy-context.tsx` | cookie choice and anonymous identifier | localStorage | Privacy-sensitive but intentionally local | Preserve consent controls and retention behavior. |
| F | `src/context/store-customer-context.tsx` | temporary signup recovery data | tenant-keyed localStorage | Medium privacy risk | Keep minimal, clear after account provisioning and never treat it as the customer record. |
| F | `src/app/(dashboard)/dashboard/page.tsx` | locally acknowledged catalog interests | localStorage | Low; presentation state only | Keep separate from the canonical catalog-interest records. |

## Phase 4A authority decision

`public.production_queue.status` is the only persistent authority for the Kanban stage. Order status, localStorage, dummy data, derived defaults and React state may initiate a request or render a mirror, but cannot calculate and write over an existing stage. Accepted manual transitions are serialized, compare the caller's `updated_at`, update the row and append `production.stage_changed` in one database transaction.
