// Database tasks against the Supabase project in .env.local.
//
//   npm run db:migrate                              supabase db push --remote (applies supabase/migrations)
//   npm run db:seed -- --owner you@example.com      load the demo data into an empty database
//
// Seeding connects with SUPABASE_DB_URL: the project's session-pooler connection string with the
// database password (Supabase dashboard → Connect). It's a secret; keep it in .env.local only.

import { Client } from 'pg';

import { seedSql } from './seed-sql';

async function seed(owner: string | undefined) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('No SUPABASE_DB_URL in .env.local (Supabase dashboard → Connect → Session pooler).');
  if (!owner || !/^\S+@\S+\.\S+$/.test(owner)) throw new Error('Usage: npm run db:seed -- --owner you@example.com');
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query<{ n: string }>('select count(*) n from public.people');
    if (Number(rows[0].n) > 0) throw new Error('The database already has people in it; the demo seed only loads into an empty database.');
    await db.query(seedSql(owner)); // the SQL runs inside its own begin/commit
    console.log(`Demo data loaded. Create an account in the app with ${owner}; it becomes the owner once linked (see README).`);
  } finally {
    await db.end();
  }
}

const [task] = process.argv.slice(2);
const ownerAt = process.argv.indexOf('--owner');
(task === 'seed' ? seed(ownerAt > 0 ? process.argv[ownerAt + 1] : undefined) : Promise.reject(new Error('Usage: scripts/db.ts seed --owner you@example.com')))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
