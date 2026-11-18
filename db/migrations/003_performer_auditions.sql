create function private.valid_performer_credits(p_credits jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when pg_catalog.jsonb_typeof(p_credits) is distinct from 'array' then false
    when pg_catalog.jsonb_array_length(p_credits) > 30 then false
    else not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_credits) as credit
      where pg_catalog.jsonb_typeof(credit -> 'production') is distinct from 'string'
        or length(trim(credit ->> 'production')) not between 1 and 120
        or pg_catalog.jsonb_typeof(credit -> 'role') is distinct from 'string'
        or length(trim(credit ->> 'role')) not between 1 and 120
        or (credit ? 'year' and (
          pg_catalog.jsonb_typeof(credit -> 'year') is distinct from 'string'
          or (credit ->> 'year') !~ '^[0-9]{4}$'
        ))
    )
  end
$$;

create function private.valid_performer_skills(p_skills text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_skills) <= 30 and not exists (
    select 1 from pg_catalog.unnest(p_skills) as skill
    where skill is null or length(trim(skill)) not between 1 and 60
  )
$$;

create table public.performer_profiles (
  person_id text primary key references public.people on delete cascade,
  headshot text not null check (
    octet_length(headshot) <= 350000
    and (length(headshot) - length('data:image/jpeg;base64,')) % 4 = 0
    and headshot ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$'
  ),
  skills text[] not null default '{}' check (private.valid_performer_skills(skills)),
  credits jsonb not null default '[]'::jsonb check (private.valid_performer_credits(credits))
);

create table public.production_auditions (
  production_id text primary key references public.productions on delete cascade,
  is_open boolean not null default false,
  details text not null default '' check (length(details) <= 1500)
);

create table public.audition_applications (
  production_id text not null references public.production_auditions on delete cascade,
  person_id text not null references public.performer_profiles on delete cascade,
  submitted_at timestamptz not null default clock_timestamp(),
  primary key (production_id, person_id)
);
create index audition_applications_person_idx on public.audition_applications (person_id);

-- Consult applications outside their policies so profile access never recurses.
create function private.can_read_performer_profile(p_person text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.audition_applications a
    where a.person_id = p_person and private.can_manage(a.production_id)
  )
$$;

alter table public.performer_profiles enable row level security;
alter table public.production_auditions enable row level security;
alter table public.audition_applications enable row level security;

create policy "performer profiles: own or shared with manager" on public.performer_profiles for select to authenticated
  using (person_id = (select private.me()) or private.can_read_performer_profile(person_id));
create policy "performer profiles: add own" on public.performer_profiles for insert to authenticated
  with check (person_id = (select private.me()));
create policy "performer profiles: edit own" on public.performer_profiles for update to authenticated
  using (person_id = (select private.me())) with check (person_id = (select private.me()));
create policy "performer profiles: remove own" on public.performer_profiles for delete to authenticated
  using (person_id = (select private.me()));

create policy "production auditions: managers read" on public.production_auditions for select to authenticated
  using (private.can_manage(production_id));
create policy "production auditions: managers add" on public.production_auditions for insert to authenticated
  with check (private.can_manage(production_id));
create policy "production auditions: managers edit" on public.production_auditions for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));

create policy "audition applications: own or manager reads" on public.audition_applications for select to authenticated
  using (person_id = (select private.me()) or private.can_manage(production_id));
create policy "audition applications: withdraw own" on public.audition_applications for delete to authenticated
  using (person_id = (select private.me()));

grant select, insert, update, delete on public.performer_profiles to authenticated;
grant select, insert, update on public.production_auditions to authenticated;
grant select, delete on public.audition_applications to authenticated;

create function public.apply_for_audition(p_production text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_person text := private.me();
begin
  if v_person is null then raise exception 'Sign in to apply for an audition.'; end if;
  if not exists (select 1 from public.performer_profiles where person_id = v_person) then
    raise exception 'Save a performer profile with a headshot before applying.';
  end if;

  -- Serialize against closing registration while permitting simultaneous applications.
  perform 1 from public.production_auditions where production_id = p_production and is_open for share;
  if not found then
    if exists (
      select 1 from public.audition_applications where production_id = p_production and person_id = v_person
    ) then return; end if;
    raise exception 'This audition is closed.';
  end if;

  insert into public.audition_applications (production_id, person_id)
  values (p_production, v_person)
  on conflict (production_id, person_id) do nothing;
end
$$;

-- Projects without run dates can advertise auditions without sharing their private plans.
create function public.list_open_auditions()
returns table (production_id text, title text, details text)
language sql stable security definer set search_path = '' as $$
  select a.production_id, p.title, a.details
  from public.production_auditions a
  join public.productions p on p.id = a.production_id
  where a.is_open and (select private.me()) is not null
  order by p.title, a.production_id
$$;

create function public.list_my_audition_applications()
returns table (production_id text, title text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.production_id, p.title, a.submitted_at
  from public.audition_applications a
  join public.productions p on p.id = a.production_id
  where a.person_id = (select private.me())
  order by a.submitted_at desc, a.production_id
$$;

create function public.list_audition_applicants(p_production text)
returns table (person_id text, name text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_manage(p_production) then
    raise exception 'Only a director or the venue owner can view applicants.';
  end if;
  return query
    select a.person_id, p.name, a.submitted_at
    from public.audition_applications a
    join public.people p on p.id = a.person_id
    where a.production_id = p_production
    order by a.submitted_at, a.person_id;
end
$$;

revoke execute on function private.valid_performer_credits(jsonb), private.valid_performer_skills(text[]),
  private.can_read_performer_profile(text), public.apply_for_audition(text), public.list_open_auditions(),
  public.list_my_audition_applications(), public.list_audition_applicants(text) from public, anonymous;
grant execute on function private.valid_performer_credits(jsonb), private.valid_performer_skills(text[]),
  private.can_read_performer_profile(text), public.apply_for_audition(text), public.list_open_auditions(),
  public.list_my_audition_applications(), public.list_audition_applicants(text) to authenticated;
