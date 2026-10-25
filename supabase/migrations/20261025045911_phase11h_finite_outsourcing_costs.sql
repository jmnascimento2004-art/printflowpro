-- Numeric typmods reject infinities, but accept NaN; nonnegative checks alone
-- therefore do not protect the canonical purchase from non-finite OT costs.
alter table public.outsourcing_orders
 add constraint outsourcing_costs_finite check(
  estimated_unit_cost <> 'NaN'::numeric and estimated_cost <> 'NaN'::numeric
  and freight <> 'NaN'::numeric
  and (actual_cost is null or actual_cost <> 'NaN'::numeric)
 );
