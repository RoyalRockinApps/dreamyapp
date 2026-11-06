/// <reference types="node" />
// Runs the migration and the demo seed on an in-process Postgres (PGlite) with small stand-ins for
// what Neon provides (Data API roles, auth.uid() from the session JWT, the neon_auth."user" table),
// then checks row-level security and the server functions as different people.
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
  impostor: '00000000-0000-0000-0000-000000000006', // account with someone else's email, never verified
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
    create role anonymous nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anonymous, authenticated;
    create schema neon_auth;
    create table neon_auth."user" (id uuid primary key, name text not null default '', email text not null, "emailVerified" boolean not null default false);
  `);
  const dir = join(__dirname, '..', 'migrations'); // db/migrations
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  await db.exec(seedSql(OWNER_EMAIL, new Date(2026, 10, 5, 12)));
  // Neon Auth accounts (signing in with an emailed code marks the email verified)
  await db.exec(`insert into neon_auth."user" (id, email, "emailVerified") values
    ('${IDS.owner}', '${OWNER_EMAIL.toUpperCase()}', true), ('${IDS.jordan}', 'jordan.ellis@example.com', true),
    ('${IDS.maya}', 'maya.brooks@example.com', true), ('${IDS.ben}', 'ben.okafor@example.com', true),
    ('${IDS.stranger}', 'new.person@example.org', true), ('${IDS.impostor}', 'grace.whitfield@example.com', false)`);
  // the app calls link_me() right after sign-in
  for (const who of ['owner', 'jordan', 'maya', 'ben', 'stranger'] as const) {
    const r = await as(who, 'select link_me() id');
    assert.equal(r.error, undefined, `${who}: ${r.error}`);
  }
});

test('signing in links people by verified email, or creates a renter', async () => {
  const linked = await sys(`select id, role, name from people where auth_user_id is not null`);
  assert.equal(linked.find((r) => r.id === 'u_owner')?.role, 'owner', 'owner email (any case) links to the owner');
  assert.ok(linked.some((r) => r.id === 'u_maya'));
  assert.equal(linked.find((r) => r.name === 'New Person')?.role, 'renter');
  assert.equal((await as('maya', 'select link_me() id'))[0].id, 'u_maya', 'linking again returns the same person');
  const impostor = await as('impostor', 'select link_me() id');
  assert.match(impostor.error ?? '', /Confirm your email/, 'an unverified email cannot claim someone');
  assert.equal((await sys(`select auth_user_id from people where id = 'u_grace'`))[0].auth_user_id, null);
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

test('signed-out visitors cannot call the app’s functions', async () => {
  await db.exec(`begin; set local role anonymous;`);
  await assert.rejects(db.query(`select hold_seats('perf_elf_1', array['A-C1'])`));
  await db.exec('rollback;');
});
