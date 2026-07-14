-- Global defaults must be revoked too: per-schema REVOKE cannot override them.
alter default privileges for role postgres revoke all on tables from anon, authenticated;
alter default privileges for role postgres revoke all on sequences from anon, authenticated;
alter default privileges for role postgres revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;
