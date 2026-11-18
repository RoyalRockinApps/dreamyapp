create table public.audition_feedback (
  id text primary key,
  production_id text not null,
  person_id text not null,
  author_id text references public.people on delete set null,
  kind text not null check (kind in ('note', 'role')),
  body text not null check (length(trim(body)) between 1 and case when kind = 'role' then 120 else 2000 end),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (production_id, person_id)
    references public.audition_applications (production_id, person_id) on delete cascade
);
create index audition_feedback_application_idx on public.audition_feedback (production_id, person_id, created_at);
alter table public.audition_feedback enable row level security;

create function public.list_audition_feedback(p_production text, p_person text)
returns table (id text, author_name text, kind text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_review_audition(p_production) then
    raise exception 'You need audition review access for this production.';
  end if;
  return query
    select f.id, coalesce(p.name, 'Former reviewer'), f.kind, f.body, f.created_at
    from public.audition_feedback f left join public.people p on p.id = f.author_id
    where f.production_id = p_production and f.person_id = p_person
    order by f.created_at desc, f.id;
end
$$;

create function public.add_audition_feedback(p_production text, p_person text, p_id text, p_kind text, p_body text)
returns table (id text, author_name text, kind text, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_author text := private.me();
begin
  if v_author is null or not private.can_review_audition(p_production) then
    raise exception 'You need audition review access for this production.';
  end if;
  if not exists (select 1 from public.audition_applications a
    where a.production_id = p_production and a.person_id = p_person)
  then
    raise exception 'This application is no longer available.';
  end if;

  insert into public.audition_feedback (id, production_id, person_id, author_id, kind, body)
    values (p_id, p_production, p_person, v_author, p_kind, trim(p_body))
    on conflict on constraint audition_feedback_pkey do nothing;

  return query
    select f.id, p.name, f.kind, f.body, f.created_at
    from public.audition_feedback f join public.people p on p.id = f.author_id
    where f.id = p_id and f.production_id = p_production and f.person_id = p_person
      and f.author_id = v_author and f.kind = p_kind and f.body = trim(p_body);
  if not found then raise exception 'This feedback could not be saved. Try again.'; end if;
end
$$;

revoke execute on function public.list_audition_feedback(text, text),
  public.add_audition_feedback(text, text, text, text, text) from public, anon;
grant execute on function public.list_audition_feedback(text, text),
  public.add_audition_feedback(text, text, text, text, text) to authenticated;
