import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;
let bootstrapPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.NEON_POSTGRES_URL ||
    ""
  ).trim();
}

function getPool() {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    const error = new Error("Database connection string is not configured.");
    (error as Error & { code?: string }).code = "DB_CONFIG_MISSING";
    throw error;
  }

  pool = new Pool({
    connectionString,
    max: 1,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  });

  return pool;
}

export async function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const client = getPool();
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS public.template_rules (
          id BIGSERIAL PRIMARY KEY,
          fingerprint TEXT NOT NULL UNIQUE,
          sheet_name TEXT NOT NULL,
          header_row_index INTEGER NOT NULL,
          column_mapping JSONB NOT NULL,
          header_names JSONB NOT NULL,
          confidence INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.import_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          file_name TEXT NOT NULL,
          sheet_name TEXT NOT NULL,
          template_fingerprint TEXT NOT NULL,
          total_count INTEGER NOT NULL DEFAULT 0,
          success_count INTEGER NOT NULL DEFAULT 0,
          failure_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.shipments (
          id BIGSERIAL PRIMARY KEY,
          batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
          external_code TEXT,
          sender_name TEXT NOT NULL,
          sender_phone TEXT NOT NULL,
          sender_address TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          recipient_phone TEXT NOT NULL,
          recipient_address TEXT NOT NULL,
          weight_kg NUMERIC(12, 3) NOT NULL,
          package_count INTEGER NOT NULL,
          temperature_zone TEXT NOT NULL,
          note TEXT,
          source_row_number INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_external_code_unique
          ON public.shipments (external_code)
          WHERE external_code IS NOT NULL AND external_code <> '';

        CREATE INDEX IF NOT EXISTS idx_shipments_recipient_name
          ON public.shipments (recipient_name);

        CREATE INDEX IF NOT EXISTS idx_shipments_created_at
          ON public.shipments (created_at DESC);
      `);
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await bootstrapDatabase();
  return getPool().query<T>(text, params) as Promise<QueryResult<T>>;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>) {
  await bootstrapDatabase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
