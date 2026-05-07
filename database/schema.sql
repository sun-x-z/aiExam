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

CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name ON public.user_profiles (display_name);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles (username);

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
  accent
)
VALUES
  (
    'U-10001',
    'admin',
    crypt('Admin123!', gen_salt('bf')),
    '系统管理员',
    'Platform Owner',
    '数字化平台部',
    'admin@example.com',
    '138-0000-0001',
    'Shanghai',
    '负责平台配置、账号治理和基础能力巡检。',
    '#0f766e'
  ),
  (
    'U-10002',
    'alice',
    crypt('Alice123!', gen_salt('bf')),
    'Alice Chen',
    'Operations Analyst',
    '经营分析组',
    'alice.chen@example.com',
    '138-0000-0002',
    'Hangzhou',
    '负责经营分析与月度报表复核。',
    '#c96f1f'
  ),
  (
    'U-10003',
    'bob',
    crypt('Bob123!', gen_salt('bf')),
    'Bob Wang',
    'Regional Manager',
    '华东区域',
    'bob.wang@example.com',
    '138-0000-0003',
    'Nanjing',
    '负责区域运营协同和多用户场景验证。',
    '#8a4b14'
  )
ON CONFLICT (username) DO NOTHING;
