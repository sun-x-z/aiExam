const { Pool } = require("pg");

let pool;
let bootstrapPromise;

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
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    const error = new Error("Database connection string is not configured.");
    error.code = "DB_CONFIG_MISSING";
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 1,
      ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const client = getPool();
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS public.user_profiles (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          department TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          location TEXT NOT NULL,
          bio TEXT NOT NULL,
          accent TEXT NOT NULL DEFAULT '#0f766e',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name
          ON public.user_profiles (display_name);

        CREATE INDEX IF NOT EXISTS idx_user_profiles_username
          ON public.user_profiles (username);

        INSERT INTO public.user_profiles (
          id,
          username,
          password_hash,
          display_name,
          role,
          department,
          email,
          phone,
          location,
          bio,
          accent,
          is_active
        )
        VALUES
          (
            'U-10001',
            'admin',
            crypt('admin123', gen_salt('bf')),
            'System Admin',
            'Platform Owner',
            'Platform Ops',
            'admin@example.com',
            '138-0000-0001',
            'Shanghai',
            'Default administrator account for initial deployment.',
            '#0f766e',
            TRUE
          ),
          (
            'U-10002',
            'alice',
            crypt('Alice123!', gen_salt('bf')),
            'Alice Chen',
            'Operations Analyst',
            'Operations',
            'alice.chen@example.com',
            '138-0000-0002',
            'Hangzhou',
            'Sample user for list rendering and role display.',
            '#c96f1f',
            TRUE
          ),
          (
            'U-10003',
            'bob',
            crypt('Bob123!', gen_salt('bf')),
            'Bob Wang',
            'Regional Manager',
            'East China',
            'bob.wang@example.com',
            '138-0000-0003',
            'Nanjing',
            'Sample user for verifying multiple records are returned.',
            '#8a4b14',
            TRUE
          )
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          department = EXCLUDED.department,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          location = EXCLUDED.location,
          bio = EXCLUDED.bio,
          accent = EXCLUDED.accent,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
      `);
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

async function query(text, params) {
  await bootstrapDatabase();
  return getPool().query(text, params);
}

module.exports = {
  bootstrapDatabase,
  query,
};
