-- Accounts on Supabase Auth, and live updates.
--
-- People sign in with email + password. Without an email sender Supabase can't prove someone owns
-- the address they typed, so a new sign-in is never linked to an existing person by email alone:
-- that would let anyone claim the owner's (or a cast member's) record by typing their address.
-- Instead the owner approves the link. A brand-new email (no matching person) simply becomes a
-- renter, which claims nothing.

create table public.link_requests (
  auth_user_id uuid primary key references auth.users on delete cascade,
  person_id text not null references public.people on delete cascade,
  email text not null,
  name text,
  declined boolean not null default false,
  requested_at timestamptz not null default now()
);
create index link_requests_person_idx on public.link_requests (person_id);
alter table public.link_requests enable row level security;
create policy "link requests: owner reads" on public.link_requests for select to authenticated
  using ((select private.is_owner()));
grant select on public.link_requests to authenticated;

-- Called right after sign-in. Returns { person } for the person this sign-in belongs to, or
-- { status: 'pending' | 'declined', message } while it waits on (or was refused by) the owner.
-- (A status rather than an error: raising would roll back the request it just recorded.)
drop function public.link_me();
create function public.link_me()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_pid text;
  v_match text;
  v_declined boolean;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select id into v_pid from public.people where auth_user_id = v_uid;
  if v_pid is not null then return jsonb_build_object('person', v_pid); end if;

  select u.email, u.raw_user_meta_data ->> 'name' into v_email, v_name from auth.users u where u.id = v_uid;
  if v_email is null then raise exception 'We couldn''t find your account. Sign in again.'; end if;

  -- someone the theatre already knows by this email: wait for the owner to confirm it's them
  select id into v_match from public.people where lower(email) = lower(v_email) and auth_user_id is null;
  if v_match is not null then
    select declined into v_declined from public.link_requests where auth_user_id = v_uid;
    if coalesce(v_declined, false) then
      return jsonb_build_object('status', 'declined', 'message', 'The theatre didn''t confirm this account. Contact them for help.');
    end if;
    insert into public.link_requests (auth_user_id, person_id, email, name)
    values (v_uid, v_match, v_email, nullif(trim(v_name), ''))
    on conflict (auth_user_id) do update set person_id = excluded.person_id, requested_at = now();
    return jsonb_build_object('status', 'pending', 'message', 'The theatre already has you on file. The owner needs to confirm this account is yours, then you''re in.');
  end if;

  if exists (select 1 from public.people where lower(email) = lower(v_email)) then
    raise exception 'This email is already linked to another sign-in. Ask the theatre owner for help.';
  end if;

  insert into public.people (id, auth_user_id, name, email, role)
  values (
    private.new_id('u_'), v_uid,
    coalesce(nullif(trim(v_name), ''), initcap(replace(split_part(v_email, '@', 1), '.', ' '))),
    v_email, 'renter'
  )
  returning id into v_pid;
  return jsonb_build_object('person', v_pid);
end $$;

-- Owner: this sign-in really is that person.
create function public.approve_link_request(p_auth_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.link_requests;
begin
  if not private.is_owner() then raise exception 'Only the owner can confirm accounts.'; end if;
  select * into v_req from public.link_requests where auth_user_id = p_auth_user for update;
  if not found then raise exception 'That request is gone. Refresh and try again.'; end if;
  update public.people set auth_user_id = v_req.auth_user_id where id = v_req.person_id and auth_user_id is null;
  if not found then raise exception 'That person is already linked to another sign-in.'; end if;
  delete from public.link_requests where auth_user_id = p_auth_user;
end $$;

-- Owner: this sign-in is not that person.
create function public.decline_link_request(p_auth_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Only the owner can decline accounts.'; end if;
  update public.link_requests set declined = true where auth_user_id = p_auth_user;
end $$;

-- Anyone: delete my account (App Store Guideline 5.1.1(v)). The sign-in is removed. The person
-- record stays for the theatre's bookkeeping (bookings, orders, chat history) but loses its name,
-- email and phone; performer profile, auditions, company memberships and preferences are deleted.
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pid text;
  v_role text;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select id, role into v_pid, v_role from public.people where auth_user_id = v_uid;
  if v_role = 'owner' and not exists (
    select 1 from public.people where role = 'owner' and auth_user_id is not null and id <> v_pid
  ) then
    raise exception 'You''re the only owner who can sign in. Make someone else an owner in People & access first.';
  end if;
  if v_pid is not null then
    delete from public.performer_profiles where person_id = v_pid;
    delete from public.memberships where person_id = v_pid;
    delete from public.home_layouts where person_id = v_pid;
    delete from public.channel_reads where person_id = v_pid;
    delete from public.member_conflicts where person_id = v_pid;
    update public.people
       set auth_user_id = null, name = 'Deleted account', email = 'deleted+' || v_pid || '@invalid.local', phone = null
     where id = v_pid;
  end if;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.link_me(), public.approve_link_request(uuid), public.decline_link_request(uuid),
  public.delete_my_account() from public, anon;
grant execute on function public.link_me(), public.approve_link_request(uuid), public.decline_link_request(uuid),
  public.delete_my_account() to authenticated;

-- Live updates (Supabase Realtime): the app reloads a part of its state when one of these changes.
-- Row-level security still decides who receives which change.
alter publication supabase_realtime add table
  public.venue_config, public.people, public.bookings, public.payments, public.productions, public.memberships,
  public.schedule_items, public.rsvps, public.member_conflicts, public.channels, public.messages,
  public.performances, public.seat_claims, public.orders, public.tickets,
  public.production_plans, public.production_milestones, public.link_requests;
