import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// pg 8 ships CommonJS, so the namespace default is the only working ESM import shape. The class is
// imported again as a type because the destructured binding above is only a value.
import pg from 'pg';
import type { Client as PgClient } from 'pg';

const { Client } = pg;

const BACKEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'migrations');

/** Supabase's public root CA, which signs the connection pooler's certificate. */
const CA_CERT_PATH = path.join(BACKEND_ROOT, 'certs', 'supabase-prod-ca-2021.crt');

const LEDGER_TABLE = 'public.schema_migrations';

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  name: string;
  checksum: string;
}

/** Reads every `.sql` file in the migrations directory in lexicographic (numbered) order. */
async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

  const migrations: Migration[] = [];
  for (const name of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    migrations.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return migrations;
}

/**
 * Records which migrations have run.
 *
 * The checksum is stored so an edit to an already-applied file is reported instead of silently
 * ignored, which is the failure mode that makes hand-applied migrations drift from the repository.
 */
async function ensureLedger(client: PgClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      baselined BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
}

async function loadApplied(client: PgClient): Promise<Map<string, AppliedMigration>> {
  const result = await client.query<AppliedMigration>(`SELECT name, checksum FROM ${LEDGER_TABLE}`);
  return new Map(result.rows.map((row: AppliedMigration) => [row.name, row]));
}

function parseArgs(argv: string[]): { baselineThrough?: string; dryRun: boolean } {
  let baselineThrough: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--baseline-through=')) baselineThrough = arg.split('=')[1]?.trim();
  }
  return baselineThrough === undefined ? { dryRun } : { baselineThrough, dryRun };
}

/**
 * Applies pending migrations against `SUPABASE_DB_URL`.
 *
 * Each file runs inside its own transaction, so a failure leaves the database on the last complete
 * migration rather than half-way through one.
 *
 * `--baseline-through=<file>` records files up to and including `<file>` as applied *without*
 * running them. That exists because this project's migrations were first applied by hand: the
 * earliest file creates tables without `IF NOT EXISTS`, so replaying it against a live schema would
 * fail. Baselining states "these are already in the database" once, and normal runs continue after.
 */
async function migrate(): Promise<void> {
  const connectionString = process.env['SUPABASE_DB_URL']?.trim();
  if (!connectionString) {
    console.error(
      'SUPABASE_DB_URL is not set. Add the Supabase session pooler URI to backend/.env.',
    );
    process.exitCode = 1;
    return;
  }

  const { baselineThrough, dryRun } = parseArgs(process.argv.slice(2));
  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    console.info('No migration files found.');
    return;
  }
  if (baselineThrough && !migrations.some((migration) => migration.name === baselineThrough)) {
    console.error(`Unknown migration for --baseline-through: ${baselineThrough}`);
    process.exitCode = 1;
    return;
  }

  // Certificate verification stays on: this connection carries schema-changing credentials, so
  // encrypting without verifying would leave it open to interception. Supabase fronts the pooler
  // with its own root CA, which is not in the system trust store, so that CA is pinned explicitly
  // rather than weakening verification.
  const client = new Client({
    connectionString,
    ssl: { ca: await readFile(CA_CERT_PATH, 'utf8'), rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await loadApplied(client);

    let baselining = !!baselineThrough;
    let changed = 0;

    for (const migration of migrations) {
      const record = applied.get(migration.name);
      if (record) {
        if (record.checksum !== migration.checksum)
          console.warn(
            `~ ${migration.name} already applied but the file has changed since. Add a new migration instead of editing it.`,
          );
        else console.info(`= ${migration.name} already applied`);

        if (migration.name === baselineThrough) baselining = false;
        continue;
      }

      if (baselining) {
        if (dryRun)
          console.info(`+ ${migration.name} would be recorded as baseline (not executed)`);
        else {
          await client.query(
            `INSERT INTO ${LEDGER_TABLE} (name, checksum, baselined) VALUES ($1, $2, TRUE)`,
            [migration.name, migration.checksum],
          );
          console.info(`+ ${migration.name} recorded as baseline (not executed)`);
        }
        changed += 1;
        if (migration.name === baselineThrough) baselining = false;
        continue;
      }

      if (dryRun) {
        console.info(`> ${migration.name} would be applied`);
        changed += 1;
        continue;
      }

      console.info(`> ${migration.name} applying…`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(`INSERT INTO ${LEDGER_TABLE} (name, checksum) VALUES ($1, $2)`, [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
        console.info(`✔ ${migration.name} applied`);
        changed += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `${migration.name} failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (changed === 0) console.info('Database is up to date.');
    else if (dryRun) console.info(`${changed} migration(s) pending.`);
    else console.info(`${changed} migration(s) processed.`);
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
