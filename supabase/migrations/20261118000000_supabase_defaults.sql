-- Supabase grants its API roles (anon, authenticated) every privilege on each new table, sequence
-- and function in `public` by default. The migrations that follow grant exactly what each table
-- needs, including column-level grants (e.g. which production_plans columns a director may change),
-- and a blanket default grant would quietly override those. Turn the defaults off for objects
-- created by this role (the one running migrations). service_role keeps its defaults.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
