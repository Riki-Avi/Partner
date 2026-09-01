import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const BACKEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CA_CERT_PATH = path.join(BACKEND_ROOT, 'certs', 'supabase-prod-ca-2021.crt');

async function clean() {
  const connectionString = process.env['SUPABASE_DB_URL'];
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is not set in backend/.env');
  }

  const ca = await readFile(CA_CERT_PATH, 'utf8');
  const client = new Client({
    connectionString,
    ssl: { ca, rejectUnauthorized: true },
  });

  await client.connect();
  try {
    const res = await client.query('DELETE FROM public.conversations');
    console.info(
      `✔ Deleted ${res.rowCount ?? 0} conversation(s) and all associated messages/corrections/feedback.`,
    );
  } finally {
    await client.end();
  }
}

clean().catch((err) => {
  console.error('Clean failed:', err);
  process.exit(1);
});
