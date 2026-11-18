alter table public.memberships add column can_plan_concept boolean not null default false;

create function private.can_plan_production(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage(p_production) or exists (
    select 1 from public.memberships
    where production_id = p_production and person_id = private.me() and can_plan_concept
  )
$$;
revoke execute on function private.can_plan_production(text) from public, anonymous;
grant execute on function private.can_plan_production(text) to authenticated;

create table public.production_concepts (
  production_id text primary key references public.productions on delete cascade,
  premise text not null default '' check (length(premise) <= 1200),
  audience text not null default '' check (length(audience) <= 200),
  performance_window text not null default '' check (length(performance_window) <= 200),
  cast_size text not null default '' check (length(cast_size) <= 120),
  rough_budget text not null default '' check (length(rough_budget) <= 120),
  audition_roles text not null default '' check (length(audition_roles) <= 450),
  audition_timing text not null default '' check (length(audition_timing) <= 450),
  audition_preparation text not null default '' check (length(audition_preparation) <= 450)
);

create table public.production_feasibility (
  production_id text not null references public.productions on delete cascade,
  item text not null check (item in ('rights', 'venue', 'budget', 'staffing', 'technical')),
  status text not null check (status in ('open', 'working', 'blocked', 'ready')),
  assignee_id text references public.people on delete set null,
  due_date date,
  notes text not null default '' check (length(notes) <= 1200),
  primary key (production_id, item)
);

alter table public.production_concepts enable row level security;
alter table public.production_feasibility enable row level security;
create policy "concepts: planning team" on public.production_concepts for all to authenticated
  using (private.can_plan_production(production_id)) with check (private.can_plan_production(production_id));
create policy "feasibility: planning team" on public.production_feasibility for all to authenticated
  using (private.can_plan_production(production_id))
  with check (
    private.can_plan_production(production_id) and (assignee_id is null or exists (
      select 1 from public.memberships m
      where m.production_id = production_feasibility.production_id and m.person_id = production_feasibility.assignee_id
    ))
  );
grant select, insert, update on public.production_concepts, public.production_feasibility to authenticated;
