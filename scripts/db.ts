// Database tasks against the Neon branch in .env.local (written by `neon init` / `neon env pull`).
//
//   npm run db:migrate                              apply new files in db/migrations, in order
//   npm run db:seed -- --owner you@example.com      load the demo data into an empty database
//
// Uses DATABASE_URL_UNPOOLED (a direct connection; migrations need session-level features).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

import { seedSql } from './seed-sql';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL_UNPOOLED. Run `neon env pull` (or `neon init`) to write .env.local first.');
  process.exit(1);
}

async function migrate(db: Client) {
  await db.query(`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  // nobody but the database owner needs to see this table
  await db.query(`alter table public.schema_migrations enable row level security`);
  const done = new Set((await db.query<{ name: string }>('select name from public.schema_migrations')).rows.map((r) => r.name));
  const dir = join(__dirname, '..', 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`applying ${f}… `);
    await db.query('begin');
    try {
      await db.query(readFileSync(join(dir, f), 'utf8'));
      await db.query('insert into public.schema_migrations (name) values ($1)', [f]);
      await db.query('commit');
      console.log('done');
      applied++;
    } catch (e) {
      await db.query('rollback');
      console.log('failed');
      throw e;
    }
  }
  console.log(applied ? `${applied} migration(s) applied.` : 'Already up to date.');
}

async function seed(db: Client, owner: string | undefined) {
  if (!owner || !/^\S+@\S+\.\S+$/.test(owner)) throw new Error('Usage: npm run db:seed -- --owner you@example.com');
  const { rows } = await db.query<{ n: string }>('select count(*) n from public.people');
  if (Number(rows[0].n) > 0) throw new Error('The database already has people in it; the demo seed only loads into an empty database.');
  await db.query(seedSql(owner)); // the SQL runs inside its own begin/commit
  console.log(`Demo data loaded. Sign in as ${owner} to be the theatre owner.`);
}

async function main() {
  const [task] = process.argv.slice(2);
  const ownerAt = process.argv.indexOf('--owner');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    if (task === 'migrate') await migrate(db);
    else if (task === 'seed') await seed(db, ownerAt > 0 ? process.argv[ownerAt + 1] : undefined);
    else throw new Error('Usage: scripts/db.ts migrate | seed --owner you@example.com');
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
