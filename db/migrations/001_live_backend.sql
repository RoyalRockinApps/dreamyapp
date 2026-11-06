-- The Dream Theatre: live backend (Neon Postgres + Neon Auth + Neon Data API).
--
-- Ids are text so they match the app's own ids (src/lib/ids.ts) one-to-one.
-- Everything that must never be decided by a phone (seat sales, check-in, payments that confirm a
-- booking) goes through the security-definer functions at the bottom of this file. Plain tables are
-- guarded by row-level security.

-- Neon Data API roles: `authenticated` (signed in, Neon Auth JWT) and `anonymous` (no token).
-- auth.uid() / auth.jwt() come from Neon's pg_session_jwt extension.
create schema if not exists private;
grant usage on schema private to anonymous, authenticated;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================================
-- Tables
-- ============================================================================================

-- One row: venue profile, rental rates/policy, house (seating) layout, admin setup checklist.
create table public.venue_config (
  id int primary key default 1 check (id = 1),
  venue jsonb not null,
  settings jsonb not null,
  house jsonb not null,
  setup jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Everyone the theatre knows: owners, renters, cast & crew. A person exists before they ever sign
-- in (the owner or a director adds them); signing in with the same, verified email links the
-- account (link_me()). auth_user_id is the Neon Auth user id (neon_auth."user".id).
create table public.people (
  id text primary key,
  auth_user_id uuid unique,
  name text not null,
  email text not null,
  phone text,
  role text not null default 'renter' check (role in ('owner', 'renter', 'member')),
  color text not null default '#9B8DE3',
  created_at timestamptz not null default clock_timestamp()
);
create unique index people_email_key on public.people (lower(email));

create table public.home_layouts (
  person_id text primary key references public.people on delete cascade,
  layout jsonb not null
);

-- ---------- Rentals ----------
create table public.bookings (
  id text primary key,
  renter_id text references public.people on delete set null,
  title text not null,
  event_type text not null,
  organization text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  attendance int not null default 0,
  package_id text,
  add_on_ids text[] not null default '{}',
  notes text,
  status text not null default 'inquiry'
    check (status in ('inquiry', 'awaiting_deposit', 'confirmed', 'completed', 'cancelled', 'declined')),
  quote jsonb not null,
  hold_expires_at timestamptz,
  ticketed boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create index bookings_renter_idx on public.bookings (renter_id);

create table public.payments (
  id text primary key,
  booking_id text not null references public.bookings on delete cascade,
  amount numeric(10, 2) not null, -- negative = refund
  kind text not null check (kind in ('deposit', 'balance', 'security_refund', 'refund')),
  method text not null check (method in ('card', 'cash', 'check')),
  reference text,
  at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

-- ---------- Productions ----------
create table public.productions (
  id text primary key,
  title text not null,
  tagline text,
  color text not null,
  opening_date timestamptz not null,
  closing_date timestamptz not null,
  groups jsonb not null default '[]'::jsonb, -- [{ id, name, color }]
  created_at timestamptz not null default clock_timestamp()
);

create table public.memberships (
  production_id text not null references public.productions on delete cascade,
  person_id text not null references public.people on delete cascade,
  group_ids text[] not null default '{}',
  part text,
  is_director boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (production_id, person_id)
);
create index memberships_person_idx on public.memberships (person_id);

create table public.schedule_items (
  id text primary key,
  production_id text not null references public.productions on delete cascade,
  title text not null,
  kind text not null,
  space text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  group_ids text[] not null default '{}',
  notes text
);
create index schedule_items_production_idx on public.schedule_items (production_id);

create table public.rsvps (
  item_id text not null references public.schedule_items on delete cascade,
  person_id text not null references public.people on delete cascade,
  answer text not null check (answer in ('yes', 'no', 'maybe')),
  primary key (item_id, person_id)
);
create index rsvps_person_idx on public.rsvps (person_id);

create table public.member_conflicts (
  id text primary key,
  production_id text not null references public.productions on delete cascade,
  person_id text not null references public.people on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default ''
);
create index member_conflicts_production_idx on public.member_conflicts (production_id);
create index member_conflicts_person_idx on public.member_conflicts (person_id);

create table public.channels (
  id text primary key,
  production_id text not null references public.productions on delete cascade,
  name text not null,
  kind text not null check (kind in ('announcements', 'group', 'direct')),
  group_id text,
  member_ids text[], -- direct messages only
  created_at timestamptz not null default clock_timestamp()
);
create index channels_production_idx on public.channels (production_id);

create table public.messages (
  id text primary key,
  channel_id text not null references public.channels on delete cascade,
  person_id text not null references public.people on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  at timestamptz not null default now()
);
create index messages_channel_idx on public.messages (channel_id, at);
create index messages_person_idx on public.messages (person_id);

create table public.channel_reads (
  person_id text not null references public.people on delete cascade,
  channel_id text not null references public.channels on delete cascade,
  read_at timestamptz not null,
  primary key (person_id, channel_id)
);
create index channel_reads_channel_idx on public.channel_reads (channel_id);

-- ---------- Ticketing ----------
create table public.performances (
  id text primary key,
  title text not null,
  subtitle text,
  production_id text references public.productions on delete set null,
  booking_id text references public.bookings on delete set null,
  starts_at timestamptz not null,
  doors_mins int not null default 30,
  prices jsonb not null, -- { premium, standard, value, accessible }
  on_sale boolean not null default true
);
create index performances_production_idx on public.performances (production_id);
create index performances_booking_idx on public.performances (booking_id);

-- One row per claimed seat. The primary key is what makes selling a seat twice impossible.
create table public.seat_claims (
  performance_id text not null references public.performances on delete cascade,
  seat_id text not null, -- e.g. 'F-C7'
  status text not null check (status in ('held', 'sold', 'comp', 'blocked')),
  holder_id text references public.people on delete cascade,
  hold_expires_at timestamptz,
  order_id text,
  note text,
  primary key (performance_id, seat_id)
);
create index seat_claims_holder_idx on public.seat_claims (holder_id);

create table public.orders (
  id text primary key,
  performance_id text not null references public.performances on delete cascade,
  seat_ids text[] not null,
  buyer_id text references public.people on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  subtotal numeric(10, 2) not null,
  fees numeric(10, 2) not null,
  total numeric(10, 2) not null,
  method text not null check (method in ('card', 'cash', 'check', 'comp')),
  refunded boolean not null default false,
  at timestamptz not null default now()
);
create index orders_performance_idx on public.orders (performance_id);
create index orders_buyer_idx on public.orders (buyer_id);

create table public.tickets (
  id text primary key,
  order_id text not null references public.orders on delete cascade,
  performance_id text not null references public.performances on delete cascade,
  seat_id text not null,
  code text not null unique,
  price numeric(10, 2) not null,
  checked_in_at timestamptz,
  void boolean not null default false
);
create unique index tickets_one_live_per_seat on public.tickets (performance_id, seat_id) where not void;
create index tickets_order_idx on public.tickets (order_id);

-- ============================================================================================
-- Who is asking? (security definer so policies can use them without recursing through RLS)
-- ============================================================================================

create function private.me() returns text
language sql stable security definer set search_path = '' as $$
  select id from public.people where auth_user_id = auth.uid()
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where auth_user_id = auth.uid() and role = 'owner')
$$;

create function private.is_member(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
     where m.production_id = p_production and p.auth_user_id = auth.uid()
  )
$$;

create function private.is_director(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
     where m.production_id = p_production and p.auth_user_id = auth.uid() and m.is_director
  )
$$;

create function private.can_manage(p_production text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner() or private.is_director(p_production)
$$;

-- People I share a production with (cast lists, chat names).
create function private.shares_production(p_person text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
      join public.memberships b on b.production_id = a.production_id
     where a.person_id = p_person and b.person_id = private.me()
  )
$$;

create function private.item_production(p_item text) returns text
language sql stable security definer set search_path = '' as $$
  select production_id from public.schedule_items where id = p_item
$$;

-- Mirrors canSeeChannel() in src/hooks/useChannels.ts. Takes the channel's columns (not its id) so the
-- channels policy also works for a row that is being inserted.
create function private.channel_visible(p_kind text, p_production text, p_group text, p_members text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_kind = 'direct' then coalesce(private.me() = any (p_members), false)
    when private.is_owner() then true
    else exists (
      select 1 from public.memberships m
       where m.production_id = p_production and m.person_id = private.me()
         and (p_group is null or m.is_director or p_group = any (m.group_ids))
    )
  end
$$;

create function private.can_read_channel(p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.channel_visible(c.kind, c.production_id, c.group_id, c.member_ids)
      from public.channels c where c.id = p_channel
  ), false)
$$;

-- Mirrors canPost(): announcements are for the owner and directors.
create function private.can_post(p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.can_read_channel(c.id) and (c.kind <> 'announcements' or private.can_manage(c.production_id))
      from public.channels c where c.id = p_channel
  ), false)
$$;

create function private.new_id(p_prefix text) returns text
language sql volatile set search_path = '' as $$
  select p_prefix || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14)
$$;

-- Same rules as layoutFor() in src/lib/seating.ts. Null = no such seat in this layout.
create function private.seat_tier(p_house jsonb, p_seat text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  m text[];
  num int;
begin
  m := regexp_match(p_seat, '^(.+)-([LCR])([0-9]+)$');
  if m is null or not (p_house -> 'rows' ? m[1]) then return null; end if;
  num := m[3]::int;
  if num < 1 or num > coalesce((p_house -> 'sectionWidths' ->> m[2])::int, 0) then return null; end if;
  if p_house -> 'accessibleSeats' ? p_seat then return 'accessible'; end if;
  if p_house -> 'valueRows' ? m[1] then return 'value'; end if;
  if m[2] = 'C' and p_house -> 'premiumRows' ? m[1] then return 'premium'; end if;
  return 'standard';
end $$;

-- "DT-7KQ4-M2XP": 32-letter alphabet without 0/O/1/I, from a cryptographic random source.
create function private.ticket_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  out text := 'DT-';
begin
  for i in 0..7 loop
    if i = 4 then out := out || '-'; end if;
    out := out || substr(alphabet, 1 + get_byte(b, i) % 32, 1);
  end loop;
  return out;
end $$;

-- A performance with live tickets can't be deleted (take it off sale or refund first).
create function private.guard_performance_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.tickets where performance_id = old.id and not void) then
    raise exception 'Tickets have been sold for this performance. Refund them or take it off sale instead.';
  end if;
  return old;
end $$;

create trigger guard_performance_delete
  before delete on public.performances
  for each row execute function private.guard_performance_delete();

-- ============================================================================================
-- Row-level security
-- ============================================================================================

alter table public.venue_config enable row level security;
alter table public.people enable row level security;
alter table public.home_layouts enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.productions enable row level security;
alter table public.memberships enable row level security;
alter table public.schedule_items enable row level security;
alter table public.rsvps enable row level security;
alter table public.member_conflicts enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.channel_reads enable row level security;
alter table public.performances enable row level security;
alter table public.seat_claims enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;

-- venue profile, rates and seating are public information
create policy "config: anyone reads" on public.venue_config for select to anonymous, authenticated using (true);
create policy "config: owner edits" on public.venue_config for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy "people: owner, self, castmates read" on public.people for select to authenticated
  using ((select private.is_owner()) or id = (select private.me()) or private.shares_production(id));
create policy "people: owner adds" on public.people for insert to authenticated with check ((select private.is_owner()));
create policy "people: owner edits" on public.people for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "people: owner removes" on public.people for delete to authenticated using ((select private.is_owner()));

create policy "home layout: mine" on public.home_layouts for all to authenticated
  using (person_id = (select private.me())) with check (person_id = (select private.me()));

create policy "bookings: owner and renter read" on public.bookings for select to authenticated
  using ((select private.is_owner()) or renter_id = (select private.me()));
create policy "bookings: request or owner adds" on public.bookings for insert to authenticated
  with check (
    (select private.is_owner())
    or (
      renter_id = (select private.me())
      and (status = 'inquiry'
        or (status = 'awaiting_deposit' and (select (settings ->> 'autoApprove')::boolean from public.venue_config where id = 1)))
    )
  );
create policy "bookings: owner edits" on public.bookings for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "bookings: renter withdraws" on public.bookings for update to authenticated
  using (renter_id = (select private.me()) and status in ('inquiry', 'awaiting_deposit'))
  with check (renter_id = (select private.me()) and status = 'cancelled');
create policy "bookings: owner removes" on public.bookings for delete to authenticated using ((select private.is_owner()));

create policy "payments: owner and renter read" on public.payments for select to authenticated
  using ((select private.is_owner()) or exists (
    select 1 from public.bookings b where b.id = booking_id and b.renter_id = (select private.me())));
-- payments are only written by add_payment()

create policy "productions: signed-in read" on public.productions for select to authenticated using (true);
create policy "productions: owner adds" on public.productions for insert to authenticated with check ((select private.is_owner()));
create policy "productions: directors edit" on public.productions for update to authenticated
  using (private.can_manage(id)) with check (private.can_manage(id));
create policy "productions: owner removes" on public.productions for delete to authenticated using ((select private.is_owner()));

create policy "memberships: company reads" on public.memberships for select to authenticated
  using ((select private.is_owner()) or private.is_member(production_id));
create policy "memberships: directors add" on public.memberships for insert to authenticated with check (private.can_manage(production_id));
create policy "memberships: directors edit" on public.memberships for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));
create policy "memberships: directors remove" on public.memberships for delete to authenticated using (private.can_manage(production_id));

create policy "schedule: company reads" on public.schedule_items for select to authenticated
  using ((select private.is_owner()) or private.is_member(production_id));
create policy "schedule: directors add" on public.schedule_items for insert to authenticated with check (private.can_manage(production_id));
create policy "schedule: directors edit" on public.schedule_items for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));
create policy "schedule: directors remove" on public.schedule_items for delete to authenticated using (private.can_manage(production_id));

create policy "rsvps: company reads" on public.rsvps for select to authenticated
  using ((select private.is_owner()) or private.is_member(private.item_production(item_id)));
create policy "rsvps: answer for myself" on public.rsvps for insert to authenticated
  with check ((person_id = (select private.me()) and private.is_member(private.item_production(item_id))) or private.can_manage(private.item_production(item_id)));
create policy "rsvps: change my answer" on public.rsvps for update to authenticated
  using (person_id = (select private.me()) or private.can_manage(private.item_production(item_id)))
  with check ((person_id = (select private.me()) and private.is_member(private.item_production(item_id))) or private.can_manage(private.item_production(item_id)));

create policy "conflicts: mine and directors read" on public.member_conflicts for select to authenticated
  using ((select private.is_owner()) or person_id = (select private.me()) or private.is_director(production_id));
create policy "conflicts: add my own" on public.member_conflicts for insert to authenticated
  with check ((person_id = (select private.me()) and private.is_member(production_id)) or private.can_manage(production_id));
create policy "conflicts: remove my own" on public.member_conflicts for delete to authenticated
  using (person_id = (select private.me()) or private.can_manage(production_id));

create policy "channels: who can see" on public.channels for select to authenticated
  using (private.channel_visible(kind, production_id, group_id, member_ids));
create policy "channels: directors and DMs add" on public.channels for insert to authenticated
  with check (
    private.can_manage(production_id)
    or (kind = 'direct' and cardinality(member_ids) = 2 and (select private.me()) = any (member_ids) and private.is_member(production_id))
  );
create policy "channels: directors edit" on public.channels for update to authenticated
  using (private.can_manage(production_id)) with check (private.can_manage(production_id));
create policy "channels: directors remove" on public.channels for delete to authenticated using (private.can_manage(production_id));

create policy "messages: channel readers" on public.messages for select to authenticated using (private.can_read_channel(channel_id));
create policy "messages: post as myself" on public.messages for insert to authenticated
  with check (person_id = (select private.me()) and private.can_post(channel_id));

create policy "reads: mine" on public.channel_reads for all to authenticated
  using (person_id = (select private.me())) with check (person_id = (select private.me()));

create policy "performances: anyone reads" on public.performances for select to anonymous, authenticated using (true);
create policy "performances: owner adds" on public.performances for insert to authenticated with check ((select private.is_owner()));
create policy "performances: owner edits" on public.performances for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "performances: owner removes" on public.performances for delete to authenticated using ((select private.is_owner()));

create policy "seats: anyone reads" on public.seat_claims for select to anonymous, authenticated using (true);
-- seat_claims are only written by hold_seats(), release_seats(), purchase_seats(), block_seats(), refund_ticket()

create policy "orders: owner and buyer read" on public.orders for select to authenticated
  using ((select private.is_owner()) or buyer_id = (select private.me()));

create policy "tickets: owner and buyer read" on public.tickets for select to authenticated
  using ((select private.is_owner()) or exists (
    select 1 from public.orders o where o.id = order_id and o.buyer_id = (select private.me())));

-- ============================================================================================
-- Server functions the app calls (Data API: POST /rpc/<name>)
-- ============================================================================================

-- Called right after sign-in. Links the Neon Auth account to the person with that email, or adds a
-- new renter. Only verified emails are linked (signing in with an emailed code verifies it), so
-- nobody can claim the owner's record by typing the owner's address.
create function public.link_me()
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_verified boolean;
  v_pid text;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select id into v_pid from public.people where auth_user_id = v_uid;
  if v_pid is not null then return v_pid; end if;

  select u.email, u.name, u."emailVerified" into v_email, v_name, v_verified from neon_auth."user" u where u.id = v_uid;
  if v_email is null then raise exception 'We couldn''t find your account. Sign in again.'; end if;
  if not coalesce(v_verified, false) then raise exception 'Confirm your email address with a sign-in code first.'; end if;

  update public.people set auth_user_id = v_uid
   where lower(email) = lower(v_email) and auth_user_id is null
  returning id into v_pid;
  if v_pid is null then
    insert into public.people (id, auth_user_id, name, email, role)
    values (
      private.new_id('u_'), v_uid,
      coalesce(nullif(trim(v_name), ''), initcap(replace(split_part(v_email, '@', 1), '.', ' '))),
      v_email, 'renter'
    )
    on conflict do nothing
    returning id into v_pid;
  end if;
  if v_pid is null then raise exception 'This email is already linked to another sign-in. Ask the theatre owner for help.'; end if;
  return v_pid;
end $$;

-- Busy times on the stage that this person can't otherwise see, with private details removed.
-- Mirrors the "Reserved" redaction in src/lib/agenda.ts.
create function public.stage_busy()
returns table (
  kind text, id text, title text, starts_at timestamptz, ends_at timestamptz, status text,
  hold_expires_at timestamptz, is_public boolean, production_id text, space text
)
language sql stable security definer set search_path = '' as $$
  select 'booking', b.id,
         case when b.is_public and b.status in ('confirmed', 'completed') then b.title else 'Reserved' end,
         b.starts_at, b.ends_at, b.status, b.hold_expires_at, b.is_public, null::text, null::text
    from public.bookings b
   where auth.uid() is not null
     and b.status in ('inquiry', 'awaiting_deposit', 'confirmed', 'completed')
     and b.renter_id is distinct from private.me()
     and not private.is_owner()
  union all
  select 'schedule', s.id, 'Reserved', s.starts_at, s.ends_at, null, null, null, s.production_id, s.space
    from public.schedule_items s
   where auth.uid() is not null
     and s.space = 'Main Stage'
     and not private.is_owner()
     and not private.is_member(s.production_id)
$$;

-- Hold seats for the caller while they check out. All-or-nothing.
create function public.hold_seats(p_performance text, p_seats text[], p_minutes int default 8)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := private.me();
  v_perf public.performances;
  v_house jsonb;
  v_taken text;
begin
  if v_me is null then raise exception 'Sign in to pick seats.'; end if;
  select * into v_perf from public.performances where id = p_performance;
  if not found then raise exception 'Performance not found.'; end if;
  if not v_perf.on_sale and not private.is_owner() then raise exception 'Tickets for this performance are not on sale.'; end if;
  if coalesce(cardinality(p_seats), 0) = 0 then return; end if;
  if cardinality(p_seats) > 10 then raise exception 'Limit 10 seats per order.'; end if;

  select c.house into v_house from public.venue_config c where c.id = 1;
  select string_agg(s, ', ') into v_taken from unnest(p_seats) s where private.seat_tier(v_house, s) is null;
  if v_taken is not null then raise exception 'No such seat: %', v_taken; end if;

  delete from public.seat_claims
   where performance_id = p_performance and status = 'held' and hold_expires_at <= now();

  select string_agg(seat_id, ', ') into v_taken from public.seat_claims
   where performance_id = p_performance and seat_id = any (p_seats)
     and not (status = 'held' and holder_id = v_me);
  if v_taken is not null then raise exception 'seats_unavailable: %', v_taken; end if;

  insert into public.seat_claims (performance_id, seat_id, status, holder_id, hold_expires_at)
  select p_performance, s, 'held', v_me, now() + make_interval(mins => least(greatest(p_minutes, 1), 15))
    from unnest(p_seats) s
  on conflict (performance_id, seat_id) do update
    set hold_expires_at = excluded.hold_expires_at
    where public.seat_claims.status = 'held' and public.seat_claims.holder_id = v_me;
exception
  when unique_violation then raise exception 'seats_unavailable: someone else just took one of these seats';
end $$;

create function public.release_seats(p_performance text, p_seats text[] default null)
returns void
language sql security definer set search_path = '' as $$
  delete from public.seat_claims
   where performance_id = p_performance and status = 'held' and holder_id = private.me()
     and (p_seats is null or seat_id = any (p_seats))
$$;

-- Sell (or comp) seats. Prices and fees come from the server, never from the phone.
-- Card payments are simulated until Stripe is connected (docs/BACKEND.md).
create function public.purchase_seats(p_performance text, p_seats text[], p_buyer_name text, p_buyer_email text, p_method text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := private.me();
  v_owner boolean := private.is_owner();
  v_perf public.performances;
  v_cfg public.venue_config;
  v_taken text;
  v_order text := private.new_id('o_');
  v_sub numeric := 0;
  v_fee numeric;
  v_tier text;
  v_price numeric;
  v_seat text;
  v_code text;
begin
  if v_me is null then raise exception 'Sign in to buy tickets.'; end if;
  if p_method not in ('card', 'cash', 'comp') then raise exception 'Unknown payment method.'; end if;
  if p_method <> 'card' and not v_owner then raise exception 'Only the box office can take cash or issue comps.'; end if;
  if coalesce(cardinality(p_seats), 0) = 0 then raise exception 'Pick at least one seat.'; end if;
  if cardinality(p_seats) > 10 and not v_owner then raise exception 'Limit 10 seats per order.'; end if;
  if (select count(distinct x) from unnest(p_seats) x) <> cardinality(p_seats) then raise exception 'Duplicate seats in order.'; end if;
  if coalesce(trim(p_buyer_name), '') = '' or p_buyer_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Add the buyer''s name and email so we can send the tickets.';
  end if;

  select * into v_perf from public.performances where id = p_performance;
  if not found then raise exception 'Performance not found.'; end if;
  if not v_perf.on_sale and not v_owner then raise exception 'Tickets for this performance are not on sale.'; end if;
  select * into v_cfg from public.venue_config where id = 1;

  delete from public.seat_claims
   where performance_id = p_performance and status = 'held' and hold_expires_at <= now();

  -- lock the rows we need and make sure each seat is free or held by the caller
  perform 1 from public.seat_claims where performance_id = p_performance and seat_id = any (p_seats) for update;
  select string_agg(seat_id, ', ') into v_taken from public.seat_claims
   where performance_id = p_performance and seat_id = any (p_seats)
     and not (status = 'held' and holder_id = v_me);
  if v_taken is not null then raise exception 'seats_unavailable: %', v_taken; end if;

  delete from public.seat_claims
   where performance_id = p_performance and seat_id = any (p_seats) and status = 'held' and holder_id = v_me;

  v_fee := case when p_method = 'comp' then 0 else coalesce((v_cfg.settings ->> 'ticketFee')::numeric, 0) end;

  insert into public.orders (id, performance_id, seat_ids, buyer_id, buyer_name, buyer_email, subtotal, fees, total, method)
  values (v_order, p_performance, p_seats, v_me, trim(p_buyer_name), trim(p_buyer_email), 0, 0, 0, p_method);

  foreach v_seat in array p_seats loop
    v_tier := private.seat_tier(v_cfg.house, v_seat);
    if v_tier is null then raise exception 'No such seat: %', v_seat; end if;
    v_price := case when p_method = 'comp' then 0 else coalesce((v_perf.prices ->> v_tier)::numeric, 0) end;
    v_sub := v_sub + v_price;
    insert into public.seat_claims (performance_id, seat_id, status, order_id)
    values (p_performance, v_seat, case when p_method = 'comp' then 'comp' else 'sold' end, v_order);
    loop
      v_code := private.ticket_code();
      exit when not exists (select 1 from public.tickets t where t.code = v_code);
    end loop;
    insert into public.tickets (id, order_id, performance_id, seat_id, code, price)
    values (private.new_id('t_'), v_order, p_performance, v_seat, v_code, v_price);
  end loop;

  update public.orders
     set subtotal = v_sub, fees = round(v_fee * cardinality(p_seats), 2), total = round(v_sub + v_fee * cardinality(p_seats), 2)
   where id = v_order;

  return jsonb_build_object('orderId', v_order);
exception
  when unique_violation then raise exception 'seats_unavailable: someone else just took one of these seats';
end $$;

create function public.refund_ticket(p_ticket text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tickets;
begin
  if not private.is_owner() then raise exception 'Only the box office can refund tickets.'; end if;
  select * into v_t from public.tickets where id = p_ticket for update;
  if not found or v_t.void then return; end if;
  update public.tickets set void = true where id = p_ticket;
  delete from public.seat_claims where performance_id = v_t.performance_id and seat_id = v_t.seat_id and order_id = v_t.order_id;
  update public.orders o set refunded = true
   where o.id = v_t.order_id and not exists (select 1 from public.tickets x where x.order_id = o.id and not x.void);
end $$;

-- Owner tool: hold back seats (sound board, house seats) or release them. Never overrides a sale.
create function public.block_seats(p_performance text, p_seats text[], p_blocked boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Only the box office can hold back seats.'; end if;
  if p_blocked then
    delete from public.seat_claims
     where performance_id = p_performance and seat_id = any (p_seats) and status = 'held';
    insert into public.seat_claims (performance_id, seat_id, status, note)
    select p_performance, s, 'blocked', p_note from unnest(p_seats) s
    on conflict (performance_id, seat_id) do update
      set note = excluded.note
      where public.seat_claims.status = 'blocked';
  else
    delete from public.seat_claims
     where performance_id = p_performance and seat_id = any (p_seats) and status = 'blocked';
  end if;
end $$;

create function public.check_in(p_code text, p_performance text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tickets;
begin
  if not private.is_owner() then raise exception 'Only the box office can check tickets in.'; end if;
  select * into v_t from public.tickets where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'message', 'Ticket not found'); end if;
  if v_t.void then return jsonb_build_object('ok', false, 'message', 'Ticket was refunded / voided', 'ticketId', v_t.id); end if;
  if v_t.performance_id <> p_performance then
    return jsonb_build_object('ok', false, 'message', 'Ticket is for a different performance', 'ticketId', v_t.id);
  end if;
  if v_t.checked_in_at is not null then return jsonb_build_object('ok', false, 'message', 'Already checked in', 'ticketId', v_t.id); end if;
  update public.tickets set checked_in_at = now() where id = v_t.id;
  return jsonb_build_object('ok', true, 'message', 'Welcome in!', 'ticketId', v_t.id);
end $$;

-- Record a payment. Paying the deposit confirms the booking automatically.
-- Renters can only pay their own approved booking by card (simulated until Stripe is connected).
create function public.add_payment(p_booking text, p_amount numeric, p_kind text, p_method text, p_reference text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_paid numeric;
  v_owner boolean := private.is_owner();
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  if not v_owner then
    if v_b.renter_id is distinct from private.me() then raise exception 'This booking is private.'; end if;
    if p_method <> 'card' or p_amount <= 0 or p_kind not in ('deposit', 'balance') then raise exception 'Not allowed.'; end if;
    if v_b.status not in ('awaiting_deposit', 'confirmed') then raise exception 'This booking isn''t ready for payment yet.'; end if;
  end if;
  insert into public.payments (id, booking_id, amount, kind, method, reference)
  values (private.new_id('pay_'), p_booking, round(p_amount, 2), p_kind, p_method, p_reference);
  select coalesce(sum(amount), 0) into v_paid from public.payments where booking_id = p_booking;
  if v_b.status in ('awaiting_deposit', 'inquiry') and v_paid >= coalesce((v_b.quote ->> 'depositDue')::numeric, 0) then
    update public.bookings set status = 'confirmed' where id = p_booking;
  end if;
end $$;

-- A director adds someone to the company. Reuses the person if that email is already known.
create function public.add_member(p_production text, p_id text, p_name text, p_email text, p_group_ids text[], p_part text default null, p_color text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pid text;
begin
  if not private.can_manage(p_production) then raise exception 'Only the owner or a director can add people.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add a name.'; end if;
  select id into v_pid from public.people where lower(email) = lower(trim(p_email));
  if v_pid is null then
    insert into public.people (id, name, email, role, color)
    values (coalesce(p_id, private.new_id('u_')), trim(p_name), trim(p_email), 'member', coalesce(p_color, '#9B8DE3'))
    returning id into v_pid;
  end if;
  insert into public.memberships (production_id, person_id, group_ids, part)
  values (p_production, v_pid, coalesce(p_group_ids, '{}'), nullif(trim(p_part), ''))
  on conflict (production_id, person_id) do update set group_ids = excluded.group_ids, part = coalesce(excluded.part, public.memberships.part);
  return v_pid;
end $$;

-- ============================================================================================
-- Privileges for the Data API roles (row-level security above decides which rows)
-- ============================================================================================

grant usage on schema public to anonymous, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.venue_config, public.performances, public.seat_claims to anonymous;

-- Only signed-in people may call the app's functions; the private helpers stay internal.
revoke execute on function
  public.link_me(), public.stage_busy(), public.hold_seats(text, text[], int), public.release_seats(text, text[]),
  public.purchase_seats(text, text[], text, text, text), public.refund_ticket(text),
  public.block_seats(text, text[], boolean, text), public.check_in(text, text),
  public.add_payment(text, numeric, text, text, text), public.add_member(text, text, text, text, text[], text, text)
  from public, anonymous;
grant execute on function
  public.link_me(), public.stage_busy(), public.hold_seats(text, text[], int), public.release_seats(text, text[]),
  public.purchase_seats(text, text[], text, text, text), public.refund_ticket(text),
  public.block_seats(text, text[], boolean, text), public.check_in(text, text),
  public.add_payment(text, numeric, text, text, text), public.add_member(text, text, text, text, text[], text, text)
  to authenticated;
revoke execute on function private.guard_performance_delete() from public, anonymous, authenticated;
