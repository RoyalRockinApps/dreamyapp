// Load "The Ballad of Ricky Bobby" test show into the live database at any stage, or remove it.
//
//   npm run test-data:ricky -- --stage casting        replace any earlier copy with one in Casting
//   npm run test-data:ricky -- --remove               take the show and its test people out
//   npm run test-data:ricky -- --stage tech --sql rb.sql   only write the SQL
//
// Stages: concept, casting, preparation, tech, performances, wrap, completed. The run is dated around
// today so today falls in that stage (see scripts/test-data/ricky-bobby.ts).
//
// It fills the theatre's own production with "Ricky Bobby" in its title (keeping its title, tagline,
// pitch and its own members; its run dates and groups become the test ones), or creates a separate
// show when there isn't one. --remove clears the test data and puts that production back in Concept.
// Uses the Supabase CLI's
// link to the live project (supabase/.temp); nothing here needs a password. Alerts aren't sent while
// it loads, and nothing outside the show's own rows (ids starting rb_) changes, except that the
// theatre's owners have the show's older chat messages marked as read.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HouseConfig } from '../src/lib/seating';
import { RB_STAGES, rickyBobbyRemoveSql, rickyBobbyRows, rickyBobbySql, type RbStage } from './test-data/ricky-bobby';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const stage = flag('--stage') as RbStage | undefined;
const remove = args.includes('--remove');
const sqlOut = flag('--sql');

if (!remove && (!stage || !RB_STAGES.includes(stage))) {
  console.error(`Usage: npm run test-data:ricky -- --stage <${RB_STAGES.join('|')}>  (or --remove)`);
  process.exit(1);
}

function supabase(cliArgs: string[], capture = false): string {
  const r = spawnSync('supabase', cliArgs, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (r.error) throw new Error(`Couldn't run the Supabase CLI: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`supabase ${cliArgs[0]} ${cliArgs[1]} failed (exit ${r.status}).`);
  return r.stdout ?? '';
}

/** The live seating chart, ticket fee, owners and the show to fill, so everything matches the real theatre. */
function liveSetup(): { house?: HouseConfig; ticketFee?: number; owners: string[]; target?: { id: string; title: string } } {
  const out = supabase(
    ['db', 'query', '--remote', '--read-only', '--output-format', 'json',
      "select (select house from public.venue_config where id = 1) as house, (select (settings->>'ticketFee')::float from public.venue_config where id = 1) as fee, (select coalesce(json_agg(id), '[]') from public.people where role = 'owner' and id not like 'rb\\_%') as owners, (select json_build_object('id', id, 'title', title) from public.productions where title ilike '%ricky bobby%' and id <> 'p_rickybobby' order by created_at limit 1) as target"],
    true,
  );
  const row = JSON.parse(out.slice(out.indexOf('{'))).rows?.[0] ?? {};
  const target = row.target && typeof row.target.id === 'string' ? { id: row.target.id as string, title: String(row.target.title) } : undefined;
  return { house: row.house ?? undefined, ticketFee: typeof row.fee === 'number' ? row.fee : undefined, owners: Array.isArray(row.owners) ? row.owners : [], target };
}

function run(sql: string, what: string) {
  if (sqlOut) {
    writeFileSync(sqlOut, sql);
    console.log(`Wrote ${what} to ${sqlOut}.`);
    return;
  }
  const file = join(mkdtempSync(join(tmpdir(), 'ricky-bobby-')), 'load.sql');
  writeFileSync(file, sql);
  supabase(['db', 'query', '--remote', '--yes', '--file', file], true);
  console.log(`Done: ${what}.`);
}

const setup = sqlOut ? { owners: ['u_owner'] } : liveSetup();
const target = 'target' in setup ? setup.target : undefined;
if (remove) {
  run(rickyBobbyRemoveSql(target?.id), target ? `cleared the test data from ${target.title} (back in Concept) and removed the test people` : 'removed the test show and its test people');
} else {
  const now = new Date();
  const opts = { stage: stage!, now, house: 'house' in setup ? setup.house : undefined, ticketFee: 'ticketFee' in setup ? setup.ticketFee : undefined, readers: setup.owners, target };
  const d = rickyBobbyRows(opts);
  run(rickyBobbySql(opts), `${target?.title ?? 'The Ballad of Ricky Bobby'} is in ${stage}`);
  const sold = d.tickets.length;
  const fmt = (x: Date) => x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  console.log(
    [
      `  Opens ${fmt(d.opening)}; closes ${fmt(new Date(d.opening.getFullYear(), d.opening.getMonth(), d.opening.getDate() + 9))}.`,
      `  ${d.memberships.length} in the company, ${d.applications.length} audition applicants, ${d.schedule.length} calls, ${d.attendance.length} attendance marks.`,
      `  ${d.tasks.length} cards with ${d.taskUpdates.length} updates, ${d.messages.length} messages, ${d.performances.length} performances, ${sold} tickets sold.`,
    ].join('\n'),
  );
}
