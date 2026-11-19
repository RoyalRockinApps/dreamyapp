-- Production stages, reworked. "Production" held tech week, the run and strike at once; it becomes
-- three stages, so a show now moves Concept → Casting → Preparation → Tech & dress → Performances
-- → Wrap → Completed. Anything still marked "production" moves to Performances.

alter table public.production_plans drop constraint production_plans_stage_check;
alter table public.production_milestones drop constraint production_milestones_stage_check;
alter table public.messages drop constraint messages_production_stage_check;

update public.production_plans set stage = 'performances' where stage = 'production';
update public.production_milestones set stage = 'performances' where stage = 'production';
update public.messages set production_stage = 'performances' where production_stage = 'production';

alter table public.production_plans add constraint production_plans_stage_check
  check (stage in ('concept', 'casting', 'preparation', 'tech', 'performances', 'wrap', 'completed'));
alter table public.production_milestones add constraint production_milestones_stage_check
  check (stage in ('concept', 'casting', 'preparation', 'tech', 'performances', 'wrap'));
alter table public.messages add constraint messages_production_stage_check
  check (production_stage in ('concept', 'casting', 'preparation', 'tech', 'performances', 'wrap', 'completed'));

-- The names the app shows (src/lib/production.ts → STAGE_LABELS), for the automatic announcement.
create function private.stage_label(p_stage text) returns text
language sql immutable set search_path = '' as $$
  select case p_stage
    when 'concept' then 'Concept' when 'casting' then 'Casting' when 'preparation' then 'Preparation'
    when 'tech' then 'Tech & dress' when 'performances' then 'Performances' when 'wrap' then 'Wrap'
    when 'completed' then 'Completed' else p_stage end
$$;

create or replace function public.change_production_stage(p_production text, p_expected text, p_stage text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_previous text;
  v_author text := private.me();
  v_channel text;
begin
  if v_author is null or not private.can_manage(p_production) then
    raise exception 'Only a director or the venue owner can change this production’s stage.';
  end if;
  if p_stage is null or p_stage not in ('concept', 'casting', 'preparation', 'tech', 'performances', 'wrap', 'completed') then
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
      format('Production stage changed from %s to %s.', private.stage_label(v_previous), private.stage_label(p_stage)),
      clock_timestamp(), p_stage);
end $$;
