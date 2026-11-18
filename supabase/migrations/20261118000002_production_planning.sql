alter table public.productions
  alter column opening_date drop not null,
  alter column closing_date drop not null,
  add constraint production_run_dates check (
    (opening_date is null and closing_date is null) or
    (opening_date is not null and closing_date is not null and closing_date >= opening_date)
  );

-- Keep undated pitches private while preserving access to existing show metadata.
drop policy "productions: signed-in read" on public.productions;
create policy "productions: show or company reads" on public.productions for select to authenticated
  using (opening_date is not null or (select private.is_owner()) or private.is_member(id));

create table public.production_plans (
  production_id text primary key references public.productions on delete cascade,
  stage text not null check (stage in ('concept', 'casting', 'preparation', 'production', 'completed')),
  pitch text
);

create table public.production_milestones (
  id text primary key,
  production_id text not null references public.productions on delete cascade,
  stage text not null check (stage in ('concept', 'casting', 'preparation', 'production')),
  title text not null check (length(trim(title)) between 1 and 120),
  due_date date,
  completed boolean not null default false
);
create index production_milestones_production_idx on public.production_milestones (production_id);

insert into public.production_plans (production_id, stage)
select id, 'preparation' from public.productions;

-- Initialize a plan for older clients and seed scripts that insert productions directly.
create function private.initialize_production_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.production_plans (production_id, stage)
  values (new.id, case when new.opening_date is null then 'concept' else 'preparation' end);
  return new;
end $$;
create trigger initialize_production_plan after insert on public.productions
  for each row execute function private.initialize_production_plan();
revoke execute on function private.initialize_production_plan() from public, anon, authenticated;

alter table public.production_plans enable row level security;
alter table public.production_milestones enable row level security;

create policy "plans: company reads" on public.production_plans for select to authenticated
  using ((select private.is_owner()) or private.is_member(production_id));
create policy "plans: directors edit" on public.production_plans for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));

create policy "milestones: company reads" on public.production_milestones for select to authenticated
  using ((select private.is_owner()) or private.is_member(production_id));
create policy "milestones: directors add" on public.production_milestones for insert to authenticated
  with check (private.can_manage(production_id));
create policy "milestones: directors edit" on public.production_milestones for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));
create policy "milestones: directors remove" on public.production_milestones for delete to authenticated
  using (private.can_manage(production_id));

grant select on public.production_plans to authenticated;
grant update (stage, pitch) on public.production_plans to authenticated;
grant select, insert, delete on public.production_milestones to authenticated;
grant update (stage, title, due_date, completed) on public.production_milestones to authenticated;

create function private.guard_director_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not private.is_owner()
    and (case when tg_op = 'INSERT' then new.is_director else new.is_director is distinct from old.is_director end)
  then
    raise exception 'Only the venue owner can change director access.';
  end if;
  return new;
end $$;
create trigger guard_director_assignment before insert or update of is_director on public.memberships
  for each row execute function private.guard_director_assignment();
revoke execute on function private.guard_director_assignment() from public, anon, authenticated;

-- A pitch, director membership and all company channels become visible together.
create function public.create_production(p_production jsonb, p_channels jsonb, p_pitch text)
returns void language plpgsql set search_path = '' as $$
declare
  p public.productions;
begin
  p := pg_catalog.jsonb_populate_record(null::public.productions, p_production);
  insert into public.productions (id, title, tagline, color, opening_date, closing_date, groups)
    values (p.id, p.title, p.tagline, p.color, p.opening_date, p.closing_date, p.groups);
  insert into public.memberships (production_id, person_id, part, is_director)
    values (p.id, private.me(), 'Director / Producer', true);
  insert into public.channels (id, production_id, name, kind, group_id)
    select c.id, p.id, c.name, c.kind, c.group_id
    from pg_catalog.jsonb_populate_recordset(null::public.channels, p_channels) c;
  update public.production_plans set stage = 'concept', pitch = p_pitch where production_id = p.id;
end $$;
revoke execute on function public.create_production(jsonb, jsonb, text) from public, anon;
grant execute on function public.create_production(jsonb, jsonb, text) to authenticated;

create function public.create_production_group(p_production text, p_group jsonb, p_channel text)
returns void language plpgsql set search_path = '' as $$
begin
  update public.productions set groups = groups || pg_catalog.jsonb_build_array(p_group)
    where id = p_production;
  if not found then raise exception 'Only the venue owner or a director can add groups.'; end if;
  insert into public.channels (id, production_id, name, kind, group_id)
    values (p_channel, p_production, p_group ->> 'name', 'group', p_group ->> 'id');
end $$;
revoke execute on function public.create_production_group(text, jsonb, text) from public, anon;
grant execute on function public.create_production_group(text, jsonb, text) to authenticated;
