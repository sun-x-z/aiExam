export const V3_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.v3_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  warehouse_id TEXT NOT NULL DEFAULT 'WH-SH-01',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.v3_waybill_snapshots (
  waybill_no TEXT PRIMARY KEY,
  external_code TEXT,
  store_name TEXT,
  sender_name TEXT,
  sender_phone TEXT,
  sender_address TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  recipient_address TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  warehouse_id TEXT NOT NULL DEFAULT 'WH-SH-01',
  skus JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'v2_realtime',
  etag TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.v3_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v3_sync_logs_created_at
  ON public.v3_sync_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.v3_exception_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  waybill_no TEXT NOT NULL REFERENCES public.v3_waybill_snapshots(waybill_no),
  sku_code TEXT,
  batch_no TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reporter_id TEXT NOT NULL REFERENCES public.v3_users(id),
  current_assignee_id TEXT REFERENCES public.v3_users(id),
  status TEXT NOT NULL,
  approval_level INTEGER NOT NULL DEFAULT 1,
  submit_count INTEGER NOT NULL DEFAULT 0,
  max_submit_count INTEGER NOT NULL DEFAULT 2,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  execution_action TEXT,
  next_deadline_at TIMESTAMPTZ,
  hold_deadline_at TIMESTAMPTZ,
  ai_suggestion JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_v3_tickets_status
  ON public.v3_exception_tickets (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v3_tickets_waybill
  ON public.v3_exception_tickets (waybill_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_ticket_manual_open_unique
  ON public.v3_exception_tickets (waybill_no, exception_type)
  WHERE source = 'manual' AND status NOT IN ('completed', 'closed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_ticket_quality_open_unique
  ON public.v3_exception_tickets (waybill_no, sku_code, batch_no)
  WHERE category = 'quality' AND status NOT IN ('completed', 'closed');

CREATE TABLE IF NOT EXISTS public.v3_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.v3_exception_tickets(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES public.v3_users(id),
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  comment TEXT NOT NULL DEFAULT '',
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_approval_idempotency
  ON public.v3_approval_records (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_v3_approval_ticket
  ON public.v3_approval_records (ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.v3_compensation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.v3_exception_tickets(id) ON DELETE CASCADE,
  approval_record_id UUID NOT NULL REFERENCES public.v3_approval_records(id),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_reconciliation',
  counterparty TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_compensation_approval_direction
  ON public.v3_compensation_records (approval_record_id, direction);

CREATE TABLE IF NOT EXISTS public.v3_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  warehouse_id TEXT NOT NULL DEFAULT 'WH-SH-01',
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
  locked_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku_code, batch_no, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.v3_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.v3_exception_tickets(id) ON DELETE CASCADE,
  approval_record_id UUID NOT NULL REFERENCES public.v3_approval_records(id),
  sku_code TEXT NOT NULL,
  batch_no TEXT NOT NULL DEFAULT '',
  movement_type TEXT NOT NULL,
  quantity_delta NUMERIC(12, 3) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_inventory_movement_idempotency
  ON public.v3_inventory_movements (approval_record_id, movement_type, sku_code, batch_no);

CREATE TABLE IF NOT EXISTS public.v3_quality_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subtype TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  auto_create_ticket BOOLEAN NOT NULL DEFAULT TRUE,
  target_approval_level INTEGER NOT NULL DEFAULT 2,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.v3_scan_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill_no TEXT NOT NULL,
  sku_code TEXT NOT NULL,
  batch_no TEXT NOT NULL DEFAULT '',
  operator_id TEXT NOT NULL REFERENCES public.v3_users(id),
  device_code TEXT NOT NULL DEFAULT '',
  judgement TEXT NOT NULL,
  exception_description TEXT NOT NULL DEFAULT '',
  matched_rule_id UUID REFERENCES public.v3_quality_rules(id),
  rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  batch_lock_status TEXT NOT NULL DEFAULT 'outbound_ready',
  ticket_id UUID REFERENCES public.v3_exception_tickets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v3_scan_ticket
  ON public.v3_scan_records (ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v3_scan_waybill_sku
  ON public.v3_scan_records (waybill_no, sku_code, batch_no);

CREATE TABLE IF NOT EXISTS public.v3_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  min_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(12, 2),
  target_level INTEGER NOT NULL DEFAULT 1,
  level1_timeout_hours INTEGER NOT NULL DEFAULT 24,
  level2_timeout_hours INTEGER NOT NULL DEFAULT 48,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.v3_system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.v3_users (id, name, role, tenant_id, warehouse_id, enabled)
VALUES
  ('u-operator', '仓库操作员', 'operator', 'default', 'WH-SH-01', TRUE),
  ('u-level1', '一级审批员', 'level1_approver', 'default', 'WH-SH-01', TRUE),
  ('u-level2', '二级审批员', 'level2_approver', 'default', 'WH-SH-01', TRUE),
  ('u-qc-supervisor', '品控主管', 'quality_supervisor', 'default', 'WH-SH-01', TRUE),
  ('u-admin', '系统管理员', 'admin', 'default', 'WH-SH-01', TRUE),
  ('u-disabled-l1', '离职一级审批员', 'level1_approver', 'default', 'WH-SH-01', FALSE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    tenant_id = EXCLUDED.tenant_id,
    warehouse_id = EXCLUDED.warehouse_id,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();

INSERT INTO public.v3_approval_rules (name, category, min_amount, max_amount, target_level, level1_timeout_hours, level2_timeout_hours, enabled)
VALUES
  ('物流异常-低金额一级审批', 'logistics', 0, 999.99, 1, 24, 48, TRUE),
  ('物流异常-高金额二级审批', 'logistics', 1000, NULL, 2, 24, 48, TRUE),
  ('品控异常-默认二级审批', 'quality', 0, NULL, 2, 24, 48, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.v3_quality_rules (name, subtype, severity, auto_create_ticket, target_approval_level, condition, enabled, priority)
VALUES
  ('数量差异超过 3%', 'quantity_mismatch', 'high', TRUE, 2, '{"metric":"quantity_delta_percent","operator":">=","value":3}'::jsonb, TRUE, 10),
  ('外观破损等级达到 2 级', 'appearance_damage', 'medium', TRUE, 2, '{"metric":"damage_level","operator":">=","value":2}'::jsonb, TRUE, 20),
  ('规格偏差超过 5mm', 'spec_mismatch', 'medium', TRUE, 2, '{"metric":"spec_deviation_mm","operator":">=","value":5}'::jsonb, TRUE, 30),
  ('标签识别不一致', 'label_error', 'medium', TRUE, 2, '{"metric":"label_matched","operator":"=","value":false}'::jsonb, TRUE, 40),
  ('批次库龄超过 30 天', 'batch_abnormal', 'high', TRUE, 2, '{"metric":"batch_age_days","operator":">=","value":30}'::jsonb, TRUE, 50)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.v3_system_settings (key, value)
VALUES
  ('max_resubmit_count', '{"value":2}'::jsonb),
  ('qc_hold_timeout_hours', '{"value":2}'::jsonb),
  ('v2_sync_strategy', '{"realtime_on_report":true,"incremental_minutes":15,"retry_count":1,"timeout_ms":3500}'::jsonb)
ON CONFLICT (key) DO NOTHING;
`;
