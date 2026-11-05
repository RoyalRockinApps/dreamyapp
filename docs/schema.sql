-- The Dream Theatre: Postgres schema (Supabase). Mirrors src/lib/types.ts.

create type role as enum ('owner', 'renter', 'member');
create type booking_status as enum ('inquiry', 'awaiting_deposit', 'confirmed', 'completed', 'cancelled', 'declined');
create type seat_status as enum ('held', 'sold', 'comp', 'blocked');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  phone text,
  role role not null default 'renter'
);

create table rental_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null -- RentalSettings: rates, packages, add-ons, policy
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  renter_id uuid references profiles,
  title text not null,
  event_type text not null,
  organization text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  attendance int not null,
  package_id text,
  add_on_ids text[] not null default '{}',
  quote jsonb not null,           -- computed server-side
  status booking_status not null default 'inquiry',
  hold_expires_at timestamptz,
  ticketed boolean not null default false,
  is_public boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  amount numeric(10,2) not null,  -- negative = refund
  kind text not null,             -- deposit | balance | security_refund | refund
  method text not null,           -- card | cash | check
  stripe_payment_intent text,
  reference text,
  at timestamptz not null default now()
);

create table productions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tagline text,
  color text not null,
  opening_date timestamptz not null,
  closing_date timestamptz not null
);
create table groups (id uuid primary key default gen_random_uuid(), production_id uuid not null references productions on delete cascade, name text not null, color text not null);
create table memberships (
  production_id uuid references productions on delete cascade,
  user_id uuid references profiles on delete cascade,
  group_ids uuid[] not null default '{}',
  part text,
  is_director boolean not null default false,
  primary key (production_id, user_id)
);
create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions on delete cascade,
  title text not null, kind text not null, space text not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  group_ids uuid[] not null default '{}', notes text
);
create table rsvps (item_id uuid references schedule_items on delete cascade, user_id uuid references profiles, answer text not null, primary key (item_id, user_id));
create table member_conflicts (id uuid primary key default gen_random_uuid(), production_id uuid references productions on delete cascade, user_id uuid references profiles, starts_at timestamptz, ends_at timestamptz, note text);
create table channels (id uuid primary key default gen_random_uuid(), production_id uuid references productions on delete cascade, name text, kind text not null, group_id uuid references groups, member_ids uuid[]);
create table messages (id uuid primary key default gen_random_uuid(), channel_id uuid not null references channels on delete cascade, user_id uuid not null references profiles, body text not null, at timestamptz not null default now());

-- ---------- Ticketing ----------
create table performances (
  id uuid primary key default gen_random_uuid(),
  title text not null, subtitle text,
  production_id uuid references productions,
  booking_id uuid references bookings,
  starts_at timestamptz not null,
  doors_mins int not null default 30,
  prices jsonb not null,          -- { premium, standard, value, accessible }
  on_sale boolean not null default true
);

-- One row per claimed seat. The primary key is what makes double-selling impossible.
create table seat_claims (
  performance_id uuid not null references performances on delete cascade,
  seat_id text not null,          -- e.g. 'F-C7'
  status seat_status not null,
  holder_id uuid references profiles,
  hold_expires_at timestamptz,
  order_id uuid,
  note text,
  primary key (performance_id, seat_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null references performances,
  buyer_id uuid references profiles,
  buyer_name text not null, buyer_email text not null,
  subtotal numeric(10,2) not null, fees numeric(10,2) not null, total numeric(10,2) not null,
  method text not null, stripe_payment_intent text,
  at timestamptz not null default now()
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  performance_id uuid not null references performances,
  seat_id text not null,
  code text not null unique,
  price numeric(10,2) not null,
  checked_in_at timestamptz,
  void boolean not null default false
);
create unique index one_live_ticket_per_seat on tickets (performance_id, seat_id) where not void;

-- Hold seats for the caller. All-or-nothing; raises if any seat is taken.
create or replace function hold_seats(p_performance uuid, p_seats text[], p_minutes int default 8)
returns void language plpgsql security definer as $$
begin
  delete from seat_claims
   where performance_id = p_performance and status = 'held' and hold_expires_at <= now();
  -- refresh caller's own holds
  delete from seat_claims
   where performance_id = p_performance and status = 'held' and holder_id = auth.uid() and seat_id = any(p_seats);
  insert into seat_claims (performance_id, seat_id, status, holder_id, hold_expires_at)
  select p_performance, s, 'held', auth.uid(), now() + make_interval(mins => p_minutes)
    from unnest(p_seats) s;            -- PK violation => seat taken => whole call fails
end $$;

-- Called by the Stripe webhook (service role) after payment succeeds.
create or replace function commit_sale(p_performance uuid, p_holder uuid, p_seats text[], p_order uuid)
returns void language plpgsql security definer as $$
declare n int;
begin
  update seat_claims
     set status = 'sold', order_id = p_order, holder_id = null, hold_expires_at = null
   where performance_id = p_performance and seat_id = any(p_seats)
     and status = 'held' and holder_id = p_holder and hold_expires_at > now();
  get diagnostics n = row_count;
  if n <> array_length(p_seats, 1) then
    raise exception 'seats_unavailable';  -- webhook refunds the charge
  end if;
end $$;

-- RLS sketch
alter table bookings enable row level security;
create policy renter_own on bookings for select using (renter_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy renter_insert on bookings for insert with check (renter_id = auth.uid() and status = 'inquiry');
create policy owner_all on bookings for all using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
-- Redacted availability for everyone
create view stage_busy as
  select id, starts_at, ends_at, case when is_public and status = 'confirmed' then title else 'Reserved' end as title
    from bookings where status in ('inquiry', 'confirmed', 'completed') or (status = 'awaiting_deposit' and hold_expires_at > now())
  union all
  select id, starts_at, ends_at, 'Reserved' from schedule_items where space = 'Main Stage';
