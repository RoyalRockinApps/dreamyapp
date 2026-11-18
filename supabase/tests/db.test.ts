/// <reference types="node" />
// Runs the migrations and the demo seed on an in-process Postgres (PGlite) with small stand-ins for
// what Supabase provides (the anon/authenticated roles and their default grants, auth.uid() from the
// session JWT, the auth.users table, the realtime publication), then checks row-level security and
// the server functions as different people.
// Run with: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';

import { seedSql } from '../../scripts/seed-sql';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OWNER_EMAIL = 'owner@dreamtheatre.test';
const IDS = {
  owner: '00000000-0000-0000-0000-000000000001',
  jordan: '00000000-0000-0000-0000-000000000002', // renter
  maya: '00000000-0000-0000-0000-000000000003', // cast (Leads)
  ben: '00000000-0000-0000-0000-000000000004', // cast + director
  stranger: '00000000-0000-0000-0000-000000000005', // signed up, unknown to the theatre
  impostor: '00000000-0000-0000-0000-000000000006', // account with someone else's email
};
type Who = keyof typeof IDS;

const db = new PGlite({ extensions: { pgcrypto } });

/** Run SQL as a signed-in person. Returns the rows, or { error } if Postgres refused. */
async function as(who: Who, sql: string): Promise<Row[] & { error?: string }> {
  await db.exec(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${IDS[who]}","role":"authenticated"}';`);
  try {
    const r = await db.query<Row>(sql);
    await db.exec('commit;');
    return r.rows as Row[] & { error?: string };
  } catch (e) {
    await db.exec('rollback;');
    return Object.assign([], { error: (e as Error).message });
  }
}
const count = async (who: Who, sql: string) => {
  const r = await as(who, sql);
  assert.equal(r.error, undefined, r.error);
  return Number(Object.values(r[0])[0]);
};
const sys = async (sql: string) => (await db.query<Row>(sql)).rows;

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}', email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create publication supabase_realtime;
    grant usage on schema public to anon, authenticated;
    -- Supabase's own defaults, which the first migration turns off
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const dir = join(__dirname, '..', 'migrations'); // supabase/migrations
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  await db.exec(seedSql(OWNER_EMAIL, new Date(2026, 10, 5, 12)));
  // Supabase Auth accounts (email + password; with no email sender, nothing proves who owns an address)
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${IDS.owner}', '${OWNER_EMAIL.toUpperCase()}', '{}'), ('${IDS.jordan}', 'jordan.ellis@example.com', '{}'),
    ('${IDS.maya}', 'maya.brooks@example.com', '{}'), ('${IDS.ben}', 'ben.okafor@example.com', '{}'),
    ('${IDS.stranger}', 'new.person@example.org', '{"name":"New Person"}'), ('${IDS.impostor}', 'grace.whitfield@example.com', '{}')`);
  // one-time bootstrap: the very first owner is linked by hand (nobody else can approve them)
  await db.exec(`update people set auth_user_id = '${IDS.owner}' where id = 'u_owner'`);
  // the app calls link_me() right after sign-in; known emails wait for the owner, who approves them
  for (const who of ['jordan', 'maya', 'ben'] as const) {
    assert.equal((await as(who, `select link_me() ->> 'status' s`))[0].s, 'pending', `${who} waits for the owner`);
    assert.equal((await as('owner', `select approve_link_request('${IDS[who]}')`)).error, undefined, `approve ${who}`);
  }
  for (const who of ['owner', 'jordan', 'maya', 'ben', 'stranger'] as const) {
    const r = await as(who, `select link_me() ->> 'person' id`);
    assert.ok(!r.error && r[0].id, `${who}: ${r.error ?? JSON.stringify(r[0])}`);
  }
});

test('a known email only links after the owner approves; a new email becomes a renter', async () => {
  const linked = await sys(`select id, role, name from people where auth_user_id is not null`);
  assert.equal(linked.find((r) => r.id === 'u_owner')?.role, 'owner');
  assert.ok(linked.some((r) => r.id === 'u_maya'), 'approved cast member is linked');
  assert.equal(linked.find((r) => r.name === 'New Person')?.role, 'renter', 'unknown email becomes a renter');
  assert.equal((await as('maya', `select link_me() ->> 'person' id`))[0].id, 'u_maya', 'linking again returns the same person');

  const claim = await as('impostor', `select link_me() ->> 'status' s`);
  assert.equal(claim[0]?.s, 'pending', 'typing someone else’s email does not claim their record');
  assert.equal((await sys(`select auth_user_id from people where id = 'u_grace'`))[0].auth_user_id, null);
  assert.equal(await count('owner', `select count(*) from link_requests where person_id = 'u_grace'`), 1, 'owner sees the request');
  assert.equal(await count('maya', 'select count(*) from link_requests'), 0, 'nobody else sees requests');
  assert.ok((await as('maya', `select approve_link_request('${IDS.impostor}')`)).error, 'only the owner approves');
  assert.equal((await as('owner', `select decline_link_request('${IDS.impostor}')`)).error, undefined);
  assert.equal((await as('impostor', `select link_me() ->> 'status' s`))[0].s, 'declined', 'declined stays declined');
  assert.equal((await sys(`select auth_user_id from people where id = 'u_grace'`))[0].auth_user_id, null);
});

test('Supabase’s blanket grants are off: column-level limits still hold', async () => {
  const anonTables = await sys(`select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' group by 1 order by 1`);
  assert.deepEqual(anonTables.map((r) => r.table_name), ['performances', 'seat_claims', 'venue_config'], 'anon can only read public info');
  const plans = await sys(`select privilege_type from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'production_plans'`);
  assert.deepEqual(plans.map((r) => r.privilege_type), ['SELECT'], 'no table-wide UPDATE on production_plans (only column grants)');
});

test('each person sees only what their role allows', async () => {
  assert.equal(await count('owner', 'select count(*) from bookings'), 8);
  assert.equal(await count('owner', 'select count(*) from stage_busy()'), 0);
  const mine = await as('jordan', 'select id from bookings order by id');
  assert.deepEqual(mine.map((b) => b.id), ['b_gospel', 'b_meeting', 'b_recital'], 'renter sees only their bookings');
  const busy = await as('jordan', 'select kind, title from stage_busy()');
  assert.equal(busy.filter((b) => b.kind === 'booking').length, 5, 'other bookings come back as busy slots');
  assert.ok(busy.filter((b) => b.kind === 'schedule').every((b) => b.title === 'Reserved'));
  assert.ok(busy.some((b) => b.kind === 'schedule'), 'Main Stage rehearsals block the calendar');
  assert.equal(await count('jordan', 'select count(*) from people'), 1);
  assert.equal(await count('jordan', 'select count(*) from schedule_items'), 0);
  assert.equal(await count('jordan', 'select count(*) from channels'), 0);
  assert.equal(await count('jordan', 'select count(*) from tickets'), 3);
  assert.equal(await count('jordan', 'select count(*) from orders'), 1);
  assert.equal(await count('maya', 'select count(*) from schedule_items'), 31);
  assert.equal(await count('maya', 'select count(*) from channels'), 4, 'Announcements, Full Company, Leads, her DM');
  assert.equal(await count('maya', 'select count(*) from people'), 13, 'the company');
  assert.equal(await count('maya', 'select count(*) from member_conflicts'), 1, 'only her own conflict');
  assert.equal(await count('ben', 'select count(*) from member_conflicts'), 3, 'directors see every conflict');
  assert.equal(await count('maya', 'select count(*) from bookings'), 0);
  assert.equal(await count('stranger', 'select count(*) from productions'), 1);
  assert.equal(await count('stranger', 'select count(*) from messages'), 0);
  assert.equal(await count('ben', `select count(*) from messages where channel_id = 'ch_dm_maya'`), 0, 'no reading other people’s DMs');
});

test('rentals: renters request, withdraw and pay; only owners approve', async () => {
  const quote = `'{"lines":[],"rentalTotal":1000,"securityDeposit":250,"depositDue":750,"balanceDue":500,"balanceDueDate":"2027-02-01T00:00:00Z","hours":5}'`;
  const booking = (id: string, status: string, renter = 'u_renter') => `insert into bookings (id, renter_id, title, event_type, contact_name, contact_email, contact_phone, starts_at, ends_at, quote, status)
    values ('${id}', '${renter}', 'Test', 'Concert', 'J', 'j@example.com', '555', '2027-03-01T18:00Z', '2027-03-01T22:00Z', ${quote}, '${status}')`;
  assert.equal((await as('jordan', booking('b_t1', 'inquiry'))).error, undefined);
  assert.ok((await as('jordan', booking('b_t2', 'confirmed'))).error, 'no self-confirmed bookings');
  assert.ok((await as('jordan', booking('b_t3', 'inquiry', 'u_hb'))).error, 'no booking in someone else’s name');
  const approve = await as('jordan', `update bookings set status = 'confirmed' where id = 'b_t1' returning id`);
  assert.ok(approve.error || approve.length === 0, 'renter cannot approve');
  assert.equal((await as('jordan', `update bookings set status = 'cancelled' where id = 'b_t1' returning id`)).length, 1, 'renter withdraws');

  const [{ d }] = await sys(`select (quote->>'depositDue')::numeric d from bookings where id = 'b_gospel'`);
  assert.ok((await as('jordan', `select add_payment('b_gospel', 1, 'deposit', 'cash')`)).error, 'renters cannot record cash');
  assert.equal((await as('jordan', `select add_payment('b_gospel', ${d}, 'deposit', 'card', 'Visa 4242')`)).error, undefined);
  assert.equal((await sys(`select status from bookings where id = 'b_gospel'`))[0].status, 'confirmed', 'deposit confirms the booking');
  assert.ok((await as('maya', `select add_payment('b_gospel', 10, 'balance', 'card')`)).error, 'not your booking');

  const rates = await as('jordan', `update venue_config set settings = settings || '{"hourlyRate": 1}' where id = 1 returning id`);
  assert.ok(rates.error || rates.length === 0, 'renters cannot change rates');
  assert.equal((await as('owner', `update venue_config set setup = '{"venue": true}' where id = 1 returning id`)).length, 1);
});

test('seats: holds, sales, comps, blocks, check-in and refunds', async () => {
  const free = (await sys(`select r || '-' || sec || n as s
    from unnest(string_to_array('KLM', null)) r, (values ('L'), ('R')) v(sec), generate_series(1, 7) n
    where not exists (select 1 from seat_claims c where c.performance_id = 'perf_elf_1' and c.seat_id = r || '-' || sec || n)
    order by r, sec, n limit 6`)).map((r) => r.s as string);
  assert.equal(free.length, 6);
  const [a, b, c, d, e] = free;

  assert.equal((await as('jordan', `select hold_seats('perf_elf_1', array['${a}','${b}'])`)).error, undefined);
  const clash = await as('maya', `select hold_seats('perf_elf_1', array['${b}','${c}'])`);
  assert.match(clash.error ?? '', new RegExp(`^seats_unavailable: ${b}`));
  assert.equal(await count('maya', `select count(*) from seat_claims where performance_id = 'perf_elf_1' and seat_id = '${c}'`), 0, 'all-or-nothing');
  assert.ok((await as('jordan', `select hold_seats('perf_elf_1', array['Z-C99'])`)).error, 'made-up seats are rejected');

  assert.ok((await as('jordan', `select purchase_seats('perf_elf_1', array['${a}','${b}'], 'J', 'j@example.com', 'cash')`)).error, 'renters cannot pay cash');
  const sold = await as('jordan', `select purchase_seats('perf_elf_1', array['${a}','${b}'], 'Jordan Ellis', 'jordan.ellis@example.com', 'card') r`);
  assert.equal(sold.error, undefined);
  const orderId = sold[0].r.orderId;
  const [order] = await sys(`select * from orders where id = '${orderId}'`);
  assert.deepEqual([Number(order.subtotal), Number(order.fees), Number(order.total)], [44, 3, 47], 'two $22 standard seats + $1.50 fee each');
  const tix = await sys(`select seat_id, price, code, id from tickets where order_id = '${orderId}' order by seat_id`);
  assert.equal(tix.length, 2);
  for (const t of tix) assert.match(t.code, /^DT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal((await sys(`select count(*) c from seat_claims where order_id = '${orderId}' and status = 'sold'`))[0].c, 2);
  assert.match((await as('maya', `select purchase_seats('perf_elf_1', array['${a}'], 'Maya', 'maya@example.com', 'card')`)).error ?? '', /^seats_unavailable/);
  assert.equal((await as('maya', `select purchase_seats('perf_elf_1', array['${c}'], 'Maya', 'maya@example.com', 'card')`)).error, undefined, 'a free seat can be bought without a hold');

  const comp = await as('owner', `select purchase_seats('perf_elf_1', array['${d}'], 'Guest', 'guest@example.com', 'comp') r`);
  assert.equal(Number((await sys(`select total from orders where id = '${comp[0].r.orderId}'`))[0].total), 0, 'comps are free');

  assert.ok((await as('jordan', `select block_seats('perf_elf_1', array['${e}'], true, 'x')`)).error, 'renters cannot hold back seats');
  assert.equal((await as('owner', `select block_seats('perf_elf_1', array['${e}'], true, 'Camera')`)).error, undefined);
  assert.equal((await sys(`select status from seat_claims where performance_id = 'perf_elf_1' and seat_id = '${e}'`))[0].status, 'blocked');

  const checkIn = async (code: string, perf = 'perf_elf_1') => (await as('owner', `select check_in('${code}', '${perf}') r`))[0].r;
  assert.ok((await as('jordan', `select check_in('${tix[0].code}', 'perf_elf_1')`)).error, 'renters cannot check tickets in');
  assert.equal((await checkIn(tix[0].code.toLowerCase())).ok, true);
  assert.equal((await checkIn(tix[0].code)).message, 'Already checked in');
  assert.equal((await checkIn(tix[1].code, 'perf_elf_2')).message, 'Ticket is for a different performance');
  assert.equal((await as('owner', `select refund_ticket('${tix[1].id}')`)).error, undefined);
  assert.equal((await sys(`select count(*) c from seat_claims where performance_id = 'perf_elf_1' and seat_id = '${tix[1].seat_id}'`))[0].c, 0, 'refund frees the seat');
  assert.equal((await checkIn(tix[1].code)).message, 'Ticket was refunded / voided');
  assert.ok((await as('owner', `delete from performances where id = 'perf_elf_1'`)).error, 'cannot delete a show with sold tickets');
});

test('company: chat, DMs, RSVPs, schedule and casting follow the director rules', async () => {
  const ch = Object.fromEntries((await sys(`select name, id from channels`)).map((r) => [r.name, r.id]));
  const post = (who: Who, channel: string, id: string) =>
    as(who, `insert into messages (id, channel_id, person_id, body) values ('${id}', '${channel}', (select id from people where auth_user_id = auth.uid()), 'hi')`);
  assert.ok((await post('maya', ch['Announcements'], 'm_t1')).error, 'cast cannot post announcements');
  assert.equal((await post('maya', ch['Full Company'], 'm_t2')).error, undefined);
  assert.equal((await post('ben', ch['Announcements'], 'm_t3')).error, undefined, 'directors can');
  assert.ok((await post('maya', ch['Tech Crew'], 'm_t4')).error, 'not in that group');
  assert.ok((await as('maya', `insert into messages (id, channel_id, person_id, body) values ('m_t5', '${ch['Full Company']}', 'u_caleb', 'fake')`)).error, 'no posting as someone else');

  const dm = (id: string, members: string) => as('maya', `insert into channels (id, production_id, name, kind, member_ids) values ('${id}', 'p_elf', 'Direct', 'direct', array[${members}]) returning id`);
  assert.equal((await dm('ch_t1', `'u_maya','u_caleb'`)).error, undefined, 'cast can DM a castmate');
  assert.ok((await dm('ch_t2', `'u_grace','u_caleb'`)).error, 'cannot open a DM between other people');

  const [{ id: item }] = await sys(`select id from schedule_items limit 1`);
  const rsvp = (person: string) => as('maya', `insert into rsvps values ('${item}', '${person}', 'yes') on conflict (item_id, person_id) do update set answer = excluded.answer`);
  assert.equal((await rsvp('u_maya')).error, undefined);
  assert.ok((await rsvp('u_caleb')).error, 'cannot RSVP for someone else');

  const call = (who: Who, id: string) => as(who, `insert into schedule_items (id, production_id, title, kind, space, starts_at, ends_at) values ('${id}', 'p_elf', 'Extra', 'Rehearsal', 'Main Stage', '2026-12-01T18:00Z', '2026-12-01T20:00Z')`);
  assert.equal((await call('ben', 's_t1')).error, undefined, 'directors schedule calls');
  assert.ok((await call('maya', 's_t2')).error, 'cast cannot');

  assert.equal((await as('ben', `select add_member('p_elf', 'u_newbie', 'Newbie', 'newbie@example.com', array['g_ensemble'], 'Elf') r`))[0].r, 'u_newbie');
  assert.equal((await as('ben', `select add_member('p_elf', 'u_dup', 'Jordan', 'JORDAN.ELLIS@example.com', array[]::text[], null) r`))[0].r, 'u_renter', 'known email reuses the person');
  assert.ok((await as('maya', `select add_member('p_elf', 'u_x', 'X', 'x@example.com', array[]::text[], null)`)).error, 'cast cannot add people');

  const conflict = (id: string, person: string) => as('maya', `insert into member_conflicts (id, production_id, person_id, starts_at, ends_at, note) values ('${id}', 'p_elf', '${person}', '2026-12-01T00:00Z', '2026-12-01T23:00Z', 'x')`);
  assert.equal((await conflict('c_t1', 'u_maya')).error, undefined);
  assert.ok((await conflict('c_t2', 'u_caleb')).error, 'not for someone else');
});

test('production pitches, stages and milestones follow company and director access', async () => {
  const create = (id: string, channelId: string) => `select create_production(
    '{"id":"${id}","title":"A New Show","color":"#9B8DE3","groups":[]}',
    '[{"id":"${channelId}","kind":"announcements","name":"Announcements"}]',
    'Pitch the show before booking dates')`;
  assert.ok((await as('maya', create('p_cast_draft', 'ch_cast_draft'))).error);
  assert.equal((await as('owner', create('p_draft', 'ch_draft'))).error, undefined);
  assert.ok((await as('owner', create('p_failed', 'ch_draft'))).error, 'a duplicate channel aborts production creation');
  assert.equal(await count('owner', "select count(*) from productions where id = 'p_failed'"), 0);
  assert.equal((await as('owner', "select stage from production_plans where production_id = 'p_draft'"))[0].stage, 'concept');
  assert.equal((await as('owner', "select opening_date from productions where id = 'p_draft'"))[0].opening_date, null);
  assert.equal(await count('stranger', "select count(*) from productions where id = 'p_draft'"), 0);
  assert.equal(await count('owner', "select count(*) from memberships where production_id = 'p_draft' and person_id = 'u_owner' and is_director"), 1);

  assert.equal((await as('owner', "insert into memberships (production_id, person_id, is_director) values ('p_draft', 'u_ben', true), ('p_draft', 'u_maya', false)")).error, undefined);
  const stage = (from: string, to: string) => `select change_production_stage('p_draft', '${from}', '${to}')`;
  assert.ok((await as('maya', stage('concept', 'casting'))).error, 'cast cannot change the production stage');
  assert.equal((await as('ben', stage('concept', 'casting'))).error, undefined);
  assert.equal((await as('ben', stage('concept', 'casting'))).error, undefined, 'retrying the same transition does not post twice');
  assert.match((await as('owner', stage('concept', 'preparation'))).error ?? '', /stage changed/, 'stale edits cannot move the production');
  assert.equal((await as('maya', "select stage from production_plans where production_id = 'p_draft'"))[0].stage, 'casting');
  assert.deepEqual(await as('maya', "select production_stage, body from messages where channel_id = 'ch_draft'"), [
    { production_stage: 'casting', body: 'Production stage changed from Concept to Casting.' },
  ]);
  assert.equal(await count('stranger', "select count(*) from messages where channel_id = 'ch_draft'"), 0);
  assert.ok((await as('ben', "insert into messages (id, channel_id, person_id, body, production_stage) values ('m_fake', 'ch_draft', 'u_ben', 'Fake completed stage', 'completed')")).error, 'manual messages cannot impersonate stage updates');
  assert.match((await as('ben', "update memberships set is_director = true where production_id = 'p_draft' and person_id = 'u_maya'")).error ?? '', /Only the venue owner/);
  assert.equal((await as('maya', "select pitch from production_plans where production_id = 'p_draft'"))[0].pitch, 'Pitch the show before booking dates');
  assert.ok((await as('ben', "update production_plans set stage = 'completed' where production_id = 'p_draft'")).error, 'stage changes go through the announcement transaction');
  const add = (id: string) => `insert into production_milestones (id, production_id, stage, title, due_date)
    values ('${id}', 'p_draft', 'casting', 'Post the cast list', '2027-01-20')`;
  assert.equal((await as('ben', add('ms_cast'))).error, undefined);
  assert.ok((await as('maya', add('ms_denied'))).error);
  assert.equal((await as('maya', "update production_milestones set completed = true where id = 'ms_cast' returning id")).length, 0);
  assert.equal((await as('ben', "update production_milestones set completed = true where id = 'ms_cast' returning id")).length, 1);
  assert.equal((await as('maya', "select completed from production_milestones where id = 'ms_cast'"))[0].completed, true);
  assert.equal((await as('ben', "update productions set opening_date = '2027-05-02', closing_date = '2027-05-04' where id = 'p_draft' returning id")).length, 1);
  assert.equal(await count('stranger', "select count(*) from production_plans where production_id = 'p_draft'"), 0);
  assert.equal(await count('stranger', "select count(*) from production_milestones where id = 'ms_cast'"), 0);

  const addStaff = (channelId: string) => `select create_production_group(
    'p_draft', '{"id":"g_draft_staff","name":"Staff","color":"#9B8DE3"}', '${channelId}')`;
  assert.ok((await as('ben', addStaff('ch_draft'))).error, 'a duplicate channel aborts group creation');
  assert.equal((await as('ben', "select groups from productions where id = 'p_draft'"))[0].groups.length, 0);
  assert.equal((await as('ben', addStaff('ch_draft_staff'))).error, undefined);
  assert.equal(await count('ben', "select count(*) from channels where id = 'ch_draft_staff'"), 1);
  assert.equal(await count('maya', "select count(*) from channels where id = 'ch_draft_staff'"), 0);
});

test('performers must save a profile and only share it by applying', async () => {
  const project = 'p_audition';
  const open = `insert into production_auditions (production_id, is_open, details)
    values ('${project}', true, 'Prepare a one-minute monologue.')
    on conflict (production_id) do update set is_open = excluded.is_open, details = excluded.details`;
  const apply = `select apply_for_audition('${project}')`;
  const photo = 'data:image/jpeg;base64,/9j/2Q==';

  assert.equal((await as('owner', `select create_production(
    '{"id":"${project}","title":"Summer Comedy","color":"#9B8DE3","groups":[]}',
    '[]', 'Private pitch')`)).error, undefined);
  assert.ok((await as('maya', open)).error, 'performers cannot advertise someone else’s show');
  assert.equal((await as('owner', open)).error, undefined);
  assert.equal(await count('jordan', `select count(*) from productions where id = '${project}'`), 0);
  const listings = await as('jordan', 'select * from list_open_auditions()');
  assert.deepEqual(listings, [{ production_id: project, title: 'Summer Comedy', details: 'Prepare a one-minute monologue.' }]);
  assert.match((await as('jordan', apply)).error ?? '', /Save a performer profile/);
  assert.ok((await as('jordan', `insert into audition_applications (production_id, person_id)
    values ('${project}', 'u_renter')`)).error, 'direct inserts cannot bypass the profile gate');
  assert.ok((await as('jordan', `insert into performer_profiles (person_id, headshot)
    values ('u_renter', 'https://example.org/photo.jpg')`)).error, 'external images are rejected');
  assert.ok((await as('jordan', `insert into performer_profiles (person_id, headshot)
    values ('u_maya', '${photo}')`)).error, 'the account owns only its profile');

  const profile = (person: string) => `insert into performer_profiles (person_id, headshot, skills, credits)
    values ('${person}', '${photo}', array['Tap', 'Soprano'],
      '[{"production":"The Wizard of Oz","role":"Dorothy","year":"2024"}]')
    on conflict (person_id) do update set headshot = excluded.headshot, skills = excluded.skills, credits = excluded.credits`;
  assert.equal((await as('jordan', profile('u_renter'))).error, undefined);
  assert.equal((await as('jordan', profile('u_renter'))).error, undefined, 'an applicant can update their own profile');
  assert.ok((await as('jordan', `update performer_profiles set credits = '[{"production":"Show","role":2}]'
    where person_id = 'u_renter'`)).error, 'past roles have a consistent format');
  assert.equal((await as('maya', `insert into performer_profiles (person_id, headshot) values ('u_maya', '${photo}')`)).error, undefined,
    'first-time performers can save a profile without skills or credits');
  assert.equal(await count('owner', 'select count(*) from performer_profiles'), 0, 'private until the performer applies');

  assert.equal((await as('jordan', apply)).error, undefined);
  assert.equal((await as('jordan', apply)).error, undefined);
  assert.equal(await count('owner', 'select count(*) from audition_applications'), 1, 'retry does not duplicate an application');
  assert.equal((await as('owner', `select person_id from list_audition_applicants('${project}')`))[0].person_id, 'u_renter');
  assert.equal(await count('owner', 'select count(*) from performer_profiles'), 1, 'only the applicant’s profile is shared');
  assert.equal(await count('ben', 'select count(*) from performer_profiles'), 0, 'a director on a different production cannot read it');
  assert.ok((await as('ben', `select * from list_audition_applicants('${project}')`)).error);
  assert.equal(await count('maya', 'select count(*) from audition_applications'), 0, 'cast cannot browse other applicants');
  assert.equal((await as('owner', `insert into memberships (production_id, person_id, is_director)
    values ('${project}', 'u_ben', true)`)).error, undefined);
  assert.deepEqual((await as('ben', "select skills from performer_profiles where person_id = 'u_renter'"))[0].skills, ['Tap', 'Soprano']);
  assert.equal((await as('ben', "update performer_profiles set skills = '{}' where person_id = 'u_renter' returning person_id")).length, 0);
  assert.equal((await as('ben', "delete from audition_applications where person_id = 'u_renter' returning person_id")).length, 0);

  const cards = (filter: string) => `select * from list_audition_review_cards('${project}', '${filter}', 0)`;
  const decide = (expected: string, decision: string) =>
    `select save_audition_review('${project}', 'u_renter', '${expected}', '${decision}')`;
  assert.equal((await as('ben', cards('pending')))[0].headshot, photo);
  assert.ok((await as('jordan', cards('all'))).error, 'applicants cannot browse review cards');
  assert.ok((await as('maya', decide('pending', 'callback'))).error);
  assert.equal((await as('owner', `insert into memberships (production_id, person_id, can_review_auditions)
    values ('${project}', 'u_maya', true)`)).error, undefined);
  assert.equal((await as('maya', cards('pending')))[0].credit.role, 'Dorothy');
  assert.equal(await count('maya', "select count(*) from performer_profiles where person_id = 'u_renter'"), 1);
  assert.equal((await as('maya', decide('pending', 'callback'))).error, undefined);
  assert.equal((await as('ben', cards('callback')))[0].decision, 'callback');
  assert.match((await as('ben', decide('pending', 'pass'))).error ?? '', /decision changed/);
  assert.equal((await as('ben', decide('callback', 'pass'))).error, undefined);
  assert.equal((await as('maya', cards('pass')))[0].decision, 'pass');
  const feedback = `select kind, body, author_name from list_audition_feedback('${project}', 'u_renter')`;
  const note = `select id from add_audition_feedback('${project}', 'u_renter', 'af_test_note', 'note', 'Strong projection.')`;
  assert.equal((await as('maya', note))[0].id, 'af_test_note');
  assert.equal((await as('maya', note))[0].id, 'af_test_note', 'a retried save returns the original entry');
  assert.equal((await as('ben', `select id from add_audition_feedback('${project}', 'u_renter', 'af_test_role', 'role', 'Ensemble')`))[0].id, 'af_test_role');
  assert.deepEqual(await as('owner', feedback), [
    { author_name: 'Ben Okafor', kind: 'role', body: 'Ensemble' },
    { author_name: 'Maya Brooks', kind: 'note', body: 'Strong projection.' },
  ]);
  assert.ok((await as('jordan', feedback)).error, 'applicants cannot read feedback');
  assert.ok((await as('jordan', note)).error, 'applicants cannot add feedback');
  assert.ok((await as('ben', `select id from add_audition_feedback('${project}', 'u_renter', 'af_test_empty', 'role', '   ')`)).error);
  assert.equal((await as('maya', "select * from audition_reviews")).length, 0, 'decision table stays private');
  assert.equal((await as('owner', `update memberships set can_review_auditions = false
    where production_id = '${project}' and person_id = 'u_maya'`)).error, undefined);
  assert.ok((await as('maya', cards('all'))).error);
  assert.ok((await as('maya', feedback)).error, 'removing staff access also removes feedback access');
  assert.equal(await count('maya', "select count(*) from performer_profiles where person_id = 'u_renter'"), 0);

  assert.equal((await as('ben', `update production_auditions set is_open = false where production_id = '${project}'`)).error, undefined);
  assert.equal(await count('jordan', 'select count(*) from list_open_auditions()'), 0);
  assert.match((await as('maya', apply)).error ?? '', /audition is closed/);
  assert.equal((await as('jordan', apply)).error, undefined, 'an accepted retry remains safe after closing');
  assert.equal((await as('jordan', 'select title from list_my_audition_applications()'))[0].title, 'Summer Comedy');
  assert.equal(await count('maya', 'select count(*) from list_my_audition_applications()'), 0);

  const withdrew = await as('jordan', `delete from audition_applications where production_id = '${project}'
    and person_id = 'u_renter' returning person_id`);
  assert.equal(withdrew.length, 1);
  assert.equal((await sys('select * from audition_reviews')).length, 0);
  assert.equal((await sys('select * from audition_feedback')).length, 0);
  assert.equal(await count('ben', 'select count(*) from performer_profiles'), 0, 'withdrawal revokes the director’s access');
  assert.equal(await count('jordan', 'select count(*) from performer_profiles'), 1, 'profile remains reusable');
});

test('Concept planning is private and the audition draft needs a separate publish action', async () => {
  const project = 'p_concept_test';
  const where = `where production_id = '${project}'`;
  const create = `select create_production(
    '{"id":"${project}","title":"Concept Test","color":"#9B8DE3","groups":[]}',
    '[{"id":"ch_concept_test","kind":"announcements","name":"Announcements"}]', null)`;
  assert.equal((await as('owner', create)).error, undefined);
  assert.equal((await as('owner', `insert into memberships (production_id, person_id, is_director)
    values ('${project}', 'u_ben', true), ('${project}', 'u_maya', false)`)).error, undefined);

  const saveBrief = `insert into production_concepts (production_id, premise, audience)
    values ('${project}', 'A town loses its library', 'Families')
    on conflict (production_id) do update set premise = excluded.premise, audience = excluded.audience`;
  assert.equal((await as('ben', saveBrief)).error, undefined);
  assert.ok((await as('maya', saveBrief)).error, 'cast cannot write the concept');
  assert.equal(await count('maya', `select count(*) from production_concepts ${where}`), 0);
  const toggle = (enabled: boolean) => `update memberships set can_plan_concept = ${enabled} ${where} and person_id = 'u_maya' returning person_id`;
  assert.equal((await as('maya', toggle(true))).length, 0, 'cast cannot grant themselves planning access');
  assert.equal((await as('ben', toggle(true)))[0].person_id, 'u_maya');

  const saveDraft = `insert into production_concepts (production_id, audition_roles, audition_timing, audition_preparation)
    values ('${project}', 'Librarian', 'December 4', 'A short monologue')
    on conflict (production_id) do update set audition_roles = excluded.audition_roles,
    audition_timing = excluded.audition_timing, audition_preparation = excluded.audition_preparation`;
  assert.equal((await as('maya', saveDraft)).error, undefined);
  assert.equal((await as('ben', saveBrief)).error, undefined);
  assert.deepEqual(await as('ben', `select premise, audience, audition_roles from production_concepts ${where}`), [
    { premise: 'A town loses its library', audience: 'Families', audition_roles: 'Librarian' },
  ]);
  const assign = (person: string) => `insert into production_feasibility (production_id, item, status, assignee_id, due_date, notes)
    values ('${project}', 'rights', 'blocked', '${person}', '2026-12-01', 'Awaiting approval')
    on conflict (production_id, item) do update set assignee_id = excluded.assignee_id`;
  assert.equal((await as('maya', assign('u_ben'))).error, undefined);
  assert.ok((await as('maya', assign('u_renter'))).error, 'assignments stay within the company');
  assert.deepEqual(await as('ben', `select status, assignee_id, due_date::text, notes from production_feasibility ${where}`), [
    { status: 'blocked', assignee_id: 'u_ben', due_date: '2026-12-01', notes: 'Awaiting approval' },
  ]);
  assert.equal(await count('stranger', `select count(*) from production_concepts ${where}`), 0);
  assert.equal(await count('stranger', `select count(*) from production_feasibility ${where}`), 0);
  assert.ok((await as('maya', `select change_production_stage('${project}', 'concept', 'casting')`)).error);
  assert.equal((await as('ben', `select change_production_stage('${project}', 'concept', 'casting')`)).error, undefined);
  assert.equal(await count('stranger', 'select count(*) from list_open_auditions()'), 0);
  assert.equal((await as('ben', `insert into production_auditions (production_id, is_open, details)
    select production_id, true, audition_roles from production_concepts ${where}`)).error, undefined);
  assert.equal((await as('stranger', 'select details from list_open_auditions()'))[0].details, 'Librarian');
  assert.equal((await as('ben', `update production_auditions set is_open = false ${where}`)).error, undefined);

  assert.equal((await as('ben', toggle(false)))[0].person_id, 'u_maya');
  assert.equal(await count('maya', `select count(*) from production_concepts ${where}`), 0);
  assert.equal(await count('maya', `select count(*) from production_feasibility ${where}`), 0);
  assert.ok((await as('maya', assign('u_ben'))).error);
});

test('signed-out visitors cannot call the app’s functions', async () => {
  await db.exec(`begin; set local role anon;`);
  await assert.rejects(db.query(`select hold_seats('perf_elf_1', array['A-C1'])`));
  await db.exec('rollback;');
  await db.exec(`begin; set local role anon;`);
  await assert.rejects(db.query('select * from list_open_auditions()'));
  await db.exec('rollback;');
  await db.exec(`begin; set local role anon;`);
  await assert.rejects(db.query('select * from production_concepts'));
  await db.exec('rollback;');
});

test('people can delete their own account; the last owner cannot', async () => {
  assert.match((await as('owner', 'select delete_my_account()')).error ?? '', /only owner/, 'the last owner must hand over first');
  const before = (await sys(`select id from people where auth_user_id = '${IDS.stranger}'`))[0].id;
  assert.equal((await as('stranger', 'select delete_my_account()')).error, undefined);
  assert.equal((await sys(`select count(*) c from auth.users where id = '${IDS.stranger}'`))[0].c, 0, 'sign-in removed');
  const p = (await sys(`select name, email, phone, auth_user_id from people where id = '${before}'`))[0];
  assert.deepEqual([p.name, p.auth_user_id, p.phone], ['Deleted account', null, null], 'personal details removed');
  assert.match(p.email, /^deleted\+.+@invalid\.local$/);
});
