create table if not exists public.distance_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.distance_route_cache (
  cache_key text primary key,
  response jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists distance_route_cache_expires_at_idx
on public.distance_route_cache (expires_at);

alter table public.distance_rate_limits enable row level security;
alter table public.distance_route_cache enable row level security;
revoke all on table public.distance_rate_limits, public.distance_route_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.distance_rate_limits, public.distance_route_cache to service_role;

create or replace function public.consume_distance_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_key is null or length(p_key) < 16 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.distance_rate_limits as limits (rate_key, window_started_at, request_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (rate_key) do update
  set window_started_at = case
        when limits.window_started_at <= now() - pg_catalog.make_interval(secs => p_window_seconds) then now()
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at <= now() - pg_catalog.make_interval(secs => p_window_seconds) then 1
        else limits.request_count + 1
      end,
      updated_at = now()
  returning request_count <= p_limit into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.consume_distance_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_distance_rate_limit(text, integer, integer) to service_role;

select pg_notify('pgrst', 'reload schema');
