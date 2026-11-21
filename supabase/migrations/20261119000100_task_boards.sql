-- Task boards: cards sorted into Not Started, In Progress and Completed, each with a thread of
-- updates that shows who posted last.
--
-- A board belongs to a production (its company and the owner see it) or, with no production, to
-- the theatre (owners and staff, plus people the owner marks as theatre Team Leads). On a
-- production, directors and the owner manage every card, and a group's Team Leads manage that
-- group's cards. On the theatre board, everyone who sees it manages it. Everyone who can see a
-- board can post updates on its cards.

alter table public.people add column team_lead boolean not null default false;
alter table public.memberships add column lead_group_ids text[] not null default '{}';

create table public.tasks (
  id text primary key,
  production_id text references public.productions on delete cascade,
  group_id text,
  title text not null check (length(trim(title)) between 1 and 120),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  assignee_id text references public.people on delete set null,
  due_date date,
  created_by text references public.people on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_group_needs_production check (production_id is not null or group_id is null)
);
create index tasks_production_idx on public.tasks (production_id);

create table public.task_updates (
  id text primary key,
  task_id text not null references public.tasks on delete cascade,
  person_id text references public.people on delete set null,
  author_name text not null,
  body text not null check (length(trim(body)) between 1 and 2000),
  at timestamptz not null default now()
);
create index task_updates_task_idx on public.task_updates (task_id, at);

-- ---------- who sees and manages what ----------

create function private.is_team_lead() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where auth_user_id = auth.uid() and team_lead)
$$;

create function private.leads_group(p_production text, p_group text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_group is not null and exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
     where m.production_id = p_production and p.auth_user_id = auth.uid() and p_group = any (m.lead_group_ids)
  )
$$;

create function private.can_see_tasks(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_production is null then private.is_owner() or private.is_team_lead()
              else private.is_owner() or private.is_member(p_production) end
$$;

create function private.can_edit_tasks(p_production text, p_group text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_production is null then private.is_owner() or private.is_team_lead()
              else private.can_manage(p_production) or private.leads_group(p_production, p_group) end
$$;

create function private.can_see_task(p_task text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t where t.id = p_task and private.can_see_tasks(t.production_id))
$$;

create function private.can_edit_task(p_task text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t where t.id = p_task and private.can_edit_tasks(t.production_id, t.group_id))
$$;

-- Team Leads are part of the theatre, so they get the app (see 20261118000009_company_only_app.sql).
create or replace function private.is_affiliated() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
     where p.auth_user_id = auth.uid()
       and (p.role in ('owner', 'member') or p.team_lead
            or exists (select 1 from public.memberships m where m.person_id = p.id))
  )
$$;

-- Theatre Team Leads see the owners, staff and other Team Leads they work with on the theatre board.
create policy "people: team leads read staff" on public.people for select to authenticated
  using ((select private.is_team_lead()) and (role = 'owner' or team_lead));

-- ---------- cards ----------

-- Server-side rules a client can't skip: who made the card, when it last changed, and that its
-- group and assignee belong to its board.
create function private.check_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := private.me();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if new.group_id is not null and not exists (
    select 1 from public.productions pr, jsonb_array_elements(pr.groups) g
     where pr.id = new.production_id and g ->> 'id' = new.group_id
  ) then
    raise exception 'Choose one of this show’s groups.';
  end if;
  if new.assignee_id is not null and not exists (
    select 1 from public.people p
     where p.id = new.assignee_id
       and (p.role = 'owner'
            or (new.production_id is null and p.team_lead)
            or (new.production_id is not null and exists (
              select 1 from public.memberships m where m.production_id = new.production_id and m.person_id = p.id)))
  ) then
    raise exception 'Assign the card to someone who can see this board.';
  end if;
  return new;
end $$;
create trigger check_task before insert or update on public.tasks
  for each row execute function private.check_task();
revoke execute on function private.check_task() from public, anon, authenticated;

alter table public.tasks enable row level security;
create policy "tasks: board reads" on public.tasks for select to authenticated
  using (private.can_see_tasks(production_id));
create policy "tasks: leads add" on public.tasks for insert to authenticated
  with check (private.can_edit_tasks(production_id, group_id));
create policy "tasks: leads edit" on public.tasks for update to authenticated
  using (private.can_edit_tasks(production_id, group_id)) with check (private.can_edit_tasks(production_id, group_id));
create policy "tasks: leads remove" on public.tasks for delete to authenticated
  using (private.can_edit_tasks(production_id, group_id));

grant select, insert, delete on public.tasks to authenticated;
-- a card stays on its board: production_id can't change
grant update (title, notes, status, assignee_id, due_date, group_id) on public.tasks to authenticated;

-- ---------- updates ----------

-- The poster is always the signed-in person, under the name they have now.
create function private.stamp_task_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.person_id := private.me();
  new.author_name := coalesce((select name from public.people where id = new.person_id), 'Someone');
  new.at := now();
  return new;
end $$;
create trigger stamp_task_update before insert on public.task_updates
  for each row execute function private.stamp_task_update();
revoke execute on function private.stamp_task_update() from public, anon, authenticated;

alter table public.task_updates enable row level security;
create policy "task updates: board reads" on public.task_updates for select to authenticated
  using (private.can_see_task(task_id));
create policy "task updates: board posts" on public.task_updates for insert to authenticated
  with check (private.can_see_task(task_id));
create policy "task updates: author or lead removes" on public.task_updates for delete to authenticated
  using (person_id = (select private.me()) or private.can_edit_task(task_id));

grant select, insert, delete on public.task_updates to authenticated;

alter publication supabase_realtime add table public.tasks, public.task_updates;
