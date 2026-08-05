import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { IMPORT_SCHEMA_SQL } from "@/lib/server/import-schema";
import { V3_SCHEMA_SQL } from "@/lib/server/v3-schema";

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
      await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await client.query(V3_SCHEMA_SQL);
      await client.query(IMPORT_SCHEMA_SQL);
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
