alter table public.messages add column production_stage text
  check (production_stage in ('concept', 'casting', 'preparation', 'production', 'completed'));

-- Only the stage-change function writes automatic announcements.
drop policy "messages: post as myself" on public.messages;
create policy "messages: post as myself" on public.messages for insert to authenticated
  with check (person_id = (select private.me()) and private.can_post(channel_id) and production_stage is null);

revoke update (stage) on public.production_plans from authenticated;

-- Start at Concept even when the creator already knows the run dates.
create or replace function public.create_production(p_production jsonb, p_channels jsonb, p_pitch text)
returns void language plpgsql set search_path = '' as $$
declare
  p public.productions;
begin
  p := pg_catalog.jsonb_populate_record(null::public.productions, p_production);
  insert into public.productions (id, title, tagline, color, groups)
    values (p.id, p.title, p.tagline, p.color, p.groups);
  update public.productions set opening_date = p.opening_date, closing_date = p.closing_date where id = p.id;
  insert into public.memberships (production_id, person_id, part, is_director)
    values (p.id, private.me(), 'Director / Producer', true);
  insert into public.channels (id, production_id, name, kind, group_id)
    select c.id, p.id, c.name, c.kind, c.group_id
    from pg_catalog.jsonb_populate_recordset(null::public.channels, p_channels) c;
  update public.production_plans set pitch = p_pitch where production_id = p.id;
end $$;

create function public.change_production_stage(p_production text, p_expected text, p_stage text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_previous text;
  v_author text := private.me();
  v_channel text;
begin
  if v_author is null or not private.can_manage(p_production) then
    raise exception 'Only a director or the venue owner can change this production’s stage.';
  end if;
  if p_stage is null or p_stage not in ('concept', 'casting', 'preparation', 'production', 'completed') then
    raise exception 'Choose a valid production stage.';
  end if;

  select stage into v_previous from public.production_plans
    where production_id = p_production for update;
  if not found then raise exception 'This production is no longer available.'; end if;
  if p_stage = v_previous then return; end if;
  if v_previous is distinct from p_expected then
    raise exception 'The production stage changed. Review the current stage and try again.';
  end if;

  select id into v_channel from public.channels
    where production_id = p_production and kind = 'announcements' and group_id is null
    order by created_at, id limit 1;
  if v_channel is null then
    v_channel := private.new_id('ch_');
    insert into public.channels (id, production_id, name, kind)
      values (v_channel, p_production, 'Announcements', 'announcements');
  end if;

  update public.production_plans set stage = p_stage where production_id = p_production;
  insert into public.messages (id, channel_id, person_id, body, at, production_stage)
    values (private.new_id('m_'), v_channel, v_author,
      format('Production stage changed from %s to %s.', initcap(v_previous), initcap(p_stage)),
      clock_timestamp(), p_stage);
end $$;
revoke execute on function public.change_production_stage(text, text, text) from public, anonymous;
grant execute on function public.change_production_stage(text, text, text) to authenticated;
