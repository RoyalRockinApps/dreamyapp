alter table public.memberships add column can_review_auditions boolean not null default false;

create function private.can_review_audition(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage(p_production) or exists (
    select 1 from public.memberships
    where production_id = p_production and person_id = private.me() and can_review_auditions
  )
$$;
revoke execute on function private.can_review_audition(text) from public, anonymous;
grant execute on function private.can_review_audition(text) to authenticated;

create or replace function private.can_read_performer_profile(p_person text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.audition_applications a
    where a.person_id = p_person and private.can_review_audition(a.production_id)
  )
$$;

-- Review decisions stay internal and disappear when the application is withdrawn.
create table public.audition_reviews (
  production_id text not null,
  person_id text not null,
  decision text not null check (decision in ('pending', 'callback', 'pass')),
  primary key (production_id, person_id),
  foreign key (production_id, person_id)
    references public.audition_applications (production_id, person_id) on delete cascade
);
alter table public.audition_reviews enable row level security;

create function public.list_audition_review_cards(p_production text, p_filter text, p_offset integer)
returns table (person_id text, name text, submitted_at timestamptz, headshot text, skills text[], credit jsonb, decision text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_review_audition(p_production) then
    raise exception 'You need audition review access for this production.';
  end if;
  return query
    select a.person_id, p.name, a.submitted_at, f.headshot, f.skills[1:2], f.credits -> 0,
      coalesce(r.decision, 'pending')
    from public.audition_applications a
    join public.people p on p.id = a.person_id
    join public.performer_profiles f on f.person_id = a.person_id
    left join public.audition_reviews r on r.production_id = a.production_id and r.person_id = a.person_id
    where a.production_id = p_production and (p_filter = 'all' or coalesce(r.decision, 'pending') = p_filter)
    order by a.submitted_at, a.person_id
    limit 13 offset greatest(0, p_offset);
end
$$;

create function public.save_audition_review(p_production text, p_person text, p_expected text, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_decision text;
begin
  if not private.can_review_audition(p_production) then
    raise exception 'You need audition review access for this production.';
  end if;
  if p_decision is null or p_decision not in ('pending', 'callback', 'pass') then
    raise exception 'Choose a valid audition decision.';
  end if;
  -- Lock the application so two reviewers cannot overwrite a decision they haven't seen.
  perform 1 from public.audition_applications
    where production_id = p_production and person_id = p_person for update;
  if not found then raise exception 'This application is no longer available.'; end if;

  select decision into v_decision from public.audition_reviews
    where production_id = p_production and person_id = p_person;
  v_decision := coalesce(v_decision, 'pending');
  if v_decision = p_decision then return; end if;
  if v_decision is distinct from p_expected then
    raise exception 'The audition decision changed. Refresh and try again.';
  end if;

  insert into public.audition_reviews (production_id, person_id, decision)
    values (p_production, p_person, p_decision)
    on conflict (production_id, person_id) do update set decision = excluded.decision;
end
$$;

revoke execute on function public.list_audition_review_cards(text, text, integer),
  public.save_audition_review(text, text, text, text) from public, anonymous;
grant execute on function public.list_audition_review_cards(text, text, integer),
  public.save_audition_review(text, text, text, text) to authenticated;
