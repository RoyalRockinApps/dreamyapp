-- Rehearsal attendance: at each call, a director (or the owner) takes roll for everyone called,
-- and a group's Team Lead takes roll for the people in their groups. Each person is marked
-- present, late, absent or excused. People see their own record; directors, the owner and Team
-- Leads see their production's.

create table public.attendance (
  item_id text not null references public.schedule_items on delete cascade,
  person_id text not null references public.people on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  note text not null default '' check (length(note) <= 200),
  marked_by text references public.people on delete set null,
  marked_at timestamptz not null default now(),
  primary key (item_id, person_id)
);
create index attendance_person_idx on public.attendance (person_id);

-- ---------- who takes roll ----------

-- Does the signed-in person lead a group that this member of the item's production belongs to?
create function private.leads_member(p_production text, p_person text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships lead
      join public.people me on me.id = lead.person_id
      join public.memberships target on target.production_id = lead.production_id and target.person_id = p_person
     where lead.production_id = p_production and me.auth_user_id = auth.uid()
       and lead.lead_group_ids && target.group_ids
  )
$$;

create function private.can_take_attendance(p_item text, p_person text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schedule_items s
     where s.id = p_item
       and (private.can_manage(s.production_id) or private.leads_member(s.production_id, p_person))
  )
$$;

-- Directors, the owner and anyone who leads a group in the production see its whole record.
create function private.can_see_attendance(p_item text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schedule_items s
     where s.id = p_item
       and (private.can_manage(s.production_id) or exists (
         select 1 from public.memberships m join public.people p on p.id = m.person_id
          where m.production_id = s.production_id and p.auth_user_id = auth.uid() and cardinality(m.lead_group_ids) > 0))
  )
$$;

-- Who marked it and when come from the server; the person must be in the call's production.
create function private.check_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.item_id <> old.item_id or new.person_id <> old.person_id) then
    raise exception 'Mark a different person with a new entry.';
  end if;
  if not exists (
    select 1 from public.schedule_items s join public.memberships m on m.production_id = s.production_id
     where s.id = new.item_id and m.person_id = new.person_id
  ) then
    raise exception 'Only people in this production can be marked.';
  end if;
  new.marked_by := private.me();
  new.marked_at := now();
  return new;
end $$;
create trigger check_attendance before insert or update on public.attendance
  for each row execute function private.check_attendance();
revoke execute on function private.check_attendance() from public, anon, authenticated;

alter table public.attendance enable row level security;
create policy "attendance: own record and leads read" on public.attendance for select to authenticated
  using (person_id = (select private.me()) or private.can_see_attendance(item_id));
create policy "attendance: leads mark" on public.attendance for insert to authenticated
  with check (private.can_take_attendance(item_id, person_id));
create policy "attendance: leads change" on public.attendance for update to authenticated
  using (private.can_take_attendance(item_id, person_id)) with check (private.can_take_attendance(item_id, person_id));
create policy "attendance: leads clear" on public.attendance for delete to authenticated
  using (private.can_take_attendance(item_id, person_id));

grant select, insert, delete on public.attendance to authenticated;
-- upserts set the key columns to their own values; the trigger stops them actually changing
grant update (item_id, person_id, status, note) on public.attendance to authenticated;

alter publication supabase_realtime add table public.attendance;
