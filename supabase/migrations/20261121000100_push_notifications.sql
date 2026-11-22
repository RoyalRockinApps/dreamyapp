-- Push notifications. Each phone that turns notifications on registers its Expo push token. The
-- database then sends alerts through Expo's push service (https://exp.host) for:
--   * a new announcement (including a production moving to a new stage), to the company
--   * a new, moved or cancelled call, to the people called
--   * a card assigned to someone, to that person
-- Nobody is alerted about their own change. Sending uses pg_net, so it happens after the change
-- commits and never slows it down; every send is logged in private.push_outbox for a week.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- The theatre's local time, for the times written in alerts.
create function private.venue_time(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_at at time zone 'America/Chicago', 'Dy Mon FMDD, FMHH12:MI AM')
$$;

-- ---------- devices ----------

create table public.push_tokens (
  token text primary key check (token ~ '^(Expo|Exponent)PushToken\[[^]]+\]$'),
  person_id text not null references public.people on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_person_idx on public.push_tokens (person_id);
-- tokens are private: nobody reads them, and phones only change them through the functions below
alter table public.push_tokens enable row level security;

-- This phone now gets the signed-in person's alerts (a shared phone moves to whoever signed in last).
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me text := private.me();
begin
  if v_me is null then raise exception 'Sign in to turn on notifications.'; end if;
  if p_token !~ '^(Expo|Exponent)PushToken\[[^]]+\]$' then raise exception 'That isn’t a notification token.'; end if;
  insert into public.push_tokens (token, person_id, platform) values (p_token, v_me, p_platform)
  on conflict (token) do update set person_id = excluded.person_id, platform = excluded.platform, updated_at = now();
end $$;

-- Signing out stops this phone's alerts. Only the phone itself knows its token.
create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token
$$;

revoke execute on function public.register_push_token(text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;

-- ---------- sending ----------

create table private.push_outbox (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  person_ids text[] not null,
  title text not null,
  body text not null,
  url text,
  tokens int not null
);

create function private.send_push(p_people text[], p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_people text[];
  v_count int;
  v_chunk jsonb;
begin
  select coalesce(array_agg(distinct x), '{}') into v_people
    from unnest(p_people) x where x is not null and x is distinct from private.me();
  if cardinality(v_people) = 0 then return; end if;

  select count(*) into v_count from public.push_tokens where person_id = any (v_people);
  -- Expo takes up to 100 messages a request
  if v_count > 0 and exists (select 1 from pg_extension where extname = 'pg_net') then
    for v_chunk in
      select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'sound', 'default', 'data', jsonb_build_object('url', p_url)))
        from (select token, (row_number() over (order by token) - 1) / 100 as n from public.push_tokens where person_id = any (v_people)) t
       group by n
    loop
      execute 'select net.http_post(url := $1, body := $2, headers := $3)'
        using 'https://exp.host/--/api/v2/push/send', v_chunk,
              '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb;
    end loop;
  end if;

  delete from private.push_outbox where at < now() - interval '7 days';
  insert into private.push_outbox (person_ids, title, body, url, tokens) values (v_people, p_title, p_body, p_url, v_count);
end $$;
revoke execute on function private.send_push(text[], text, text, text) from public, anon, authenticated;

-- Everyone called to a call: the full company, or its groups plus the directors (as in src/lib/scheduling.ts).
create function private.called_people(p_production text, p_groups text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.person_id), '{}') from public.memberships m
   where m.production_id = p_production and (cardinality(p_groups) = 0 or m.is_director or m.group_ids && p_groups)
$$;

-- ---------- what sends an alert ----------

create function private.push_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select ch.kind, ch.group_id, ch.production_id, p.title into c
    from public.channels ch join public.productions p on p.id = ch.production_id where ch.id = new.channel_id;
  if c.kind is distinct from 'announcements' then return null; end if;
  perform private.send_push(
    (select array_agg(m.person_id) from public.memberships m
      where m.production_id = c.production_id and (c.group_id is null or m.is_director or c.group_id = any (m.group_ids))),
    c.title || ': announcement', left(new.body, 180), '/chat/' || new.channel_id);
  return null;
end $$;
create trigger push_announcement after insert on public.messages
  for each row execute function private.push_announcement();

create function private.push_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.schedule_items := case when tg_op = 'DELETE' then old else new end;
  v_show text := (select title from public.productions where id = v_item.production_id);
  v_people text[];
begin
  -- past calls, and calls removed along with their production, send nothing
  if v_show is null or v_item.ends_at < now() then return null; end if;
  if tg_op = 'UPDATE' then
    if (new.starts_at, new.ends_at, new.space, new.group_ids) is not distinct from (old.starts_at, old.ends_at, old.space, old.group_ids) then return null; end if;
    v_people := private.called_people(new.production_id, new.group_ids) || private.called_people(old.production_id, old.group_ids);
  else
    v_people := private.called_people(v_item.production_id, v_item.group_ids);
  end if;
  perform private.send_push(
    v_people,
    case tg_op when 'INSERT' then 'New call: ' when 'UPDATE' then 'Call changed: ' else 'Call cancelled: ' end || v_item.title,
    v_show || ' · ' || private.venue_time(v_item.starts_at) || ' · ' || v_item.space,
    '/production/' || v_item.production_id || '?tab=schedule' || case when tg_op = 'DELETE' then '' else '&item=' || v_item.id end);
  return null;
end $$;
create trigger push_schedule after insert or update or delete on public.schedule_items
  for each row execute function private.push_schedule();

create function private.push_task_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is null or new.status = 'completed' or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then return null; end if;
  perform private.send_push(
    array[new.assignee_id], 'New card for you',
    new.title || ' · ' || coalesce((select title from public.productions where id = new.production_id), 'Theatre board'),
    '/task/' || new.id);
  return null;
end $$;
create trigger push_task_assignment after insert or update of assignee_id on public.tasks
  for each row execute function private.push_task_assignment();

revoke execute on function private.push_announcement(), private.push_schedule(), private.push_task_assignment() from public, anon, authenticated;
