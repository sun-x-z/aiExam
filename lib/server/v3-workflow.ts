import type { PoolClient, QueryResultRow } from "pg";
import { query, withClient } from "@/lib/server/db";
import { fetchWaybillFromV2, getCachedWaybillSnapshot, validateSkuWithV2 } from "@/lib/server/v2-client";
import type {
  ApprovalDecision,
  ApprovalRecord,
  ApprovalRule,
  BatchLockStatus,
  CompensationDirection,
  CompensationRecord,
  ExceptionTicket,
  ExceptionType,
  InventoryMovement,
  LogisticsExceptionType,
  QualityExceptionType,
  QualityRule,
  ScanJudgement,
  ScanRecord,
  TicketCategory,
  TicketDetail,
  TicketStatus,
  V3Role,
  V3User,
  WaybillSnapshot,
  WaybillSku,
} from "@/lib/v3/types";

type TicketRow = {
  id: string;
  ticket_no: string;
  source: "manual" | "scan";
  category: TicketCategory;
  exception_type: ExceptionType;
  waybill_no: string;
  sku_code: string | null;
  batch_no: string | null;
  amount: string;
  reporter_id: string;
  reporter_name?: string | null;
  current_assignee_id: string | null;
  current_assignee_name?: string | null;
  status: TicketStatus;
  approval_level: number;
  submit_count: number;
  max_submit_count: number;
  version: number;
  description: string;
  execution_action: string | null;
  next_deadline_at: string | null;
  hold_deadline_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type WaybillRow = {
  waybill_no: string;
  external_code: string | null;
  store_name: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  sender_address: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  amount: string;
  waybill_status: string;
  tenant_id: string;
  warehouse_id: string;
  skus: WaybillSku[];
  source_updated_at: string | null;
  synced_at: string;
  waybill_source: "v2_realtime" | "local_cache";
};

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WorkflowError";
    this.status = status;
  }
}

const ROLE_LABEL: Record<V3Role, string> = {
  operator: "操作员",
  level1_approver: "一级审批员",
  level2_approver: "二级审批员",
  quality_supervisor: "品控主管",
  admin: "系统管理员",
};

const QUALITY_TYPES = new Set<ExceptionType>(["quantity_mismatch", "appearance_damage", "spec_mismatch", "label_error", "batch_abnormal"]);

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function mapUser(row: { id: string; name: string; role: V3Role; tenant_id: string; warehouse_id: string; enabled: boolean }): V3User {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    tenantId: row.tenant_id,
    warehouseId: row.warehouse_id,
    enabled: row.enabled,
  };
}

function mapWaybill(row: WaybillRow | null | undefined): WaybillSnapshot | undefined {
  if (!row) return undefined;
  return {
    waybillNo: row.waybill_no,
    externalCode: row.external_code,
    storeName: row.store_name,
    senderName: row.sender_name,
    senderPhone: row.sender_phone,
    senderAddress: row.sender_address,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    recipientAddress: row.recipient_address,
    amount: Number(row.amount),
    status: row.waybill_status,
    tenantId: row.tenant_id,
    warehouseId: row.warehouse_id,
    skus: row.skus || [],
    sourceUpdatedAt: row.source_updated_at,
    syncedAt: row.synced_at,
    source: row.waybill_source || "v2_realtime",
  };
}

function mapTicket(row: TicketRow & Partial<WaybillRow>): ExceptionTicket {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    source: row.source,
    category: row.category,
    exceptionType: row.exception_type,
    waybillNo: row.waybill_no,
    skuCode: row.sku_code,
    batchNo: row.batch_no,
    amount: Number(row.amount),
    reporterId: row.reporter_id,
    reporterName: row.reporter_name ?? null,
    currentAssigneeId: row.current_assignee_id,
    currentAssigneeName: row.current_assignee_name ?? null,
    status: row.status,
    approvalLevel: row.approval_level,
    submitCount: row.submit_count,
    maxSubmitCount: row.max_submit_count,
    version: row.version,
    description: row.description,
    executionAction: row.execution_action,
    nextDeadlineAt: row.next_deadline_at,
    holdDeadlineAt: row.hold_deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    waybill: mapWaybill(row as WaybillRow),
  };
}

function mapApproval(row: {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_name?: string | null;
  action: string;
  result: string;
  level: number;
  comment: string;
  from_status: TicketStatus;
  to_status: TicketStatus;
  idempotency_key: string | null;
  created_at: string;
}): ApprovalRecord {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    actorName: row.actor_name ?? null,
    action: row.action,
    result: row.result,
    level: row.level,
    comment: row.comment,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function mapQualityRule(row: {
  id: string;
  name: string;
  subtype: QualityExceptionType;
  severity: "low" | "medium" | "high";
  auto_create_ticket: boolean;
  target_approval_level: number;
  condition: QualityRule["condition"];
  enabled: boolean;
  priority: number;
  updated_at: string;
}): QualityRule {
  return {
    id: row.id,
    name: row.name,
    subtype: row.subtype,
    severity: row.severity,
    autoCreateTicket: row.auto_create_ticket,
    targetApprovalLevel: row.target_approval_level,
    condition: row.condition,
    enabled: row.enabled,
    priority: row.priority,
    updatedAt: row.updated_at,
  };
}

function mapApprovalRule(row: {
  id: string;
  name: string;
  category: TicketCategory;
  min_amount: string;
  max_amount: string | null;
  target_level: number;
  level1_timeout_hours: number;
  level2_timeout_hours: number;
  enabled: boolean;
  updated_at: string;
}): ApprovalRule {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    minAmount: Number(row.min_amount),
    maxAmount: row.max_amount === null ? null : Number(row.max_amount),
    targetLevel: row.target_level,
    level1TimeoutHours: row.level1_timeout_hours,
    level2TimeoutHours: row.level2_timeout_hours,
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

function createTicketNo(prefix = "V3") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function runQuery<T extends QueryResultRow>(client: PoolClient | undefined, text: string, params: unknown[] = []) {
  return client ? client.query<T>(text, params) : query<T>(text, params);
}

async function getActor(actorId: string, client?: PoolClient) {
  const result = await runQuery<{
    id: string;
    name: string;
    role: V3Role;
    tenant_id: string;
    warehouse_id: string;
    enabled: boolean;
  }>(client, `SELECT id, name, role, tenant_id, warehouse_id, enabled FROM public.v3_users WHERE id = $1`, [actorId]);
  const row = result.rows[0];
  if (!row || !row.enabled) throw new WorkflowError("当前操作人不存在或已禁用", 403);
  return mapUser(row);
}

function assertRole(actor: V3User, roles: V3Role[]) {
  if (actor.role === "admin") return;
  if (!roles.includes(actor.role)) {
    throw new WorkflowError(`当前角色为${ROLE_LABEL[actor.role]}，无权执行该操作`, 403);
  }
}

async function getSettingNumber(key: string, fallback: number) {
  const result = await query<{ value: { value?: number } }>(`SELECT value FROM public.v3_system_settings WHERE key = $1`, [key]);
  return Number(result.rows[0]?.value?.value ?? fallback);
}

async function getApprovalRule(category: TicketCategory, amount: number, client?: PoolClient) {
  const result = await runQuery<{
    id: string;
    name: string;
    category: TicketCategory;
    min_amount: string;
    max_amount: string | null;
    target_level: number;
    level1_timeout_hours: number;
    level2_timeout_hours: number;
    enabled: boolean;
    updated_at: string;
  }>(
    client,
    `SELECT id, name, category, min_amount, max_amount, target_level, level1_timeout_hours, level2_timeout_hours, enabled, updated_at
     FROM public.v3_approval_rules
     WHERE category = $1 AND enabled = TRUE AND min_amount <= $2 AND (max_amount IS NULL OR max_amount >= $2)
     ORDER BY target_level DESC, min_amount DESC
     LIMIT 1`,
    [category, amount]
  );
  return result.rows[0] ? mapApprovalRule(result.rows[0]) : null;
}

async function getAssigneeForLevel(level: number, client?: PoolClient) {
  const role = level >= 2 ? "level2_approver" : "level1_approver";
  const result = await runQuery<{ id: string }>(
    client,
    `SELECT id FROM public.v3_users WHERE role = $1 AND enabled = TRUE ORDER BY id LIMIT 1`,
    [role]
  );
  const assignee = result.rows[0]?.id;
  if (!assignee) throw new WorkflowError(`${level}级审批缺少可用审批人`, 500);
  return assignee;
}

async function insertApprovalRecord(
  client: PoolClient,
  input: {
    ticketId: string;
    actorId: string;
    action: string;
    result: string;
    level: number;
    comment: string;
    fromStatus: TicketStatus;
    toStatus: TicketStatus;
    idempotencyKey?: string | null;
  }
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.v3_approval_records (
      ticket_id, actor_id, action, result, level, comment, from_status, to_status, idempotency_key
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id`,
    [
      input.ticketId,
      input.actorId,
      input.action,
      input.result,
      input.level,
      input.comment,
      input.fromStatus,
      input.toStatus,
      input.idempotencyKey ?? null,
    ]
  );
  return result.rows[0].id;
}

function resolveExecution(ticket: TicketRow): {
  action: string;
  direction?: CompensationDirection;
  compensationAmount?: number;
  movementType?: string;
  quantityDelta?: number;
  releaseBatch?: boolean;
} {
  const amount = Number(ticket.amount);
  if (ticket.category === "logistics") {
    const type = ticket.exception_type as LogisticsExceptionType;
    if (type === "address_error") return { action: "reship", movementType: "reshipment_outbound", quantityDelta: -1 };
    if (type === "customer_rejected") return { action: "return_to_stock", movementType: "return_inbound", quantityDelta: 1 };
    if (type === "delivery_timeout") return { action: "customer_compensation", direction: "customer_compensation", compensationAmount: Math.round(amount * 0.1 * 100) / 100 };
    if (type === "damaged") return { action: "customer_compensation_and_return", direction: "customer_compensation", compensationAmount: amount, movementType: "damaged_return_inbound", quantityDelta: 1 };
    return { action: "customer_compensation_and_reship", direction: "customer_compensation", compensationAmount: amount, movementType: "reshipment_outbound", quantityDelta: -1 };
  }

  const type = ticket.exception_type as QualityExceptionType;
  if (type === "label_error") return { action: "release_after_relabel", releaseBatch: true };
  if (type === "batch_abnormal") {
    return { action: "downgrade_and_recover", direction: "supplier_recovery", compensationAmount: Math.round(amount * 0.3 * 100) / 100, movementType: "downgrade_release", quantityDelta: -1, releaseBatch: true };
  }
  if (type === "quantity_mismatch") {
    return { action: "repurchase_and_recover", direction: "supplier_recovery", compensationAmount: amount, movementType: "scrap_and_repurchase", quantityDelta: -1, releaseBatch: true };
  }
  return { action: "return_supplier_and_recover", direction: "supplier_recovery", compensationAmount: amount, movementType: "return_supplier", quantityDelta: -1, releaseBatch: true };
}

async function executeApprovedTicket(client: PoolClient, ticket: TicketRow, approvalRecordId: string) {
  const execution = resolveExecution(ticket);
  const skuCode = ticket.sku_code || "unknown";
  const batchNo = ticket.batch_no || "";

  if (execution.direction && execution.compensationAmount && execution.compensationAmount > 0) {
    await client.query(
      `INSERT INTO public.v3_compensation_records (
        ticket_id, approval_record_id, amount, direction, status, counterparty
      ) VALUES ($1,$2,$3,$4,'pending_reconciliation',$5)
      ON CONFLICT (approval_record_id, direction) DO NOTHING`,
      [
        ticket.id,
        approvalRecordId,
        execution.compensationAmount,
        execution.direction,
        execution.direction === "customer_compensation" ? "客户" : "供应商",
      ]
    );
  }

  if (execution.movementType && ticket.sku_code) {
    await client.query(
      `INSERT INTO public.v3_inventory_items (sku_code, batch_no, warehouse_id, quantity, locked_quantity, status)
       VALUES ($1,$2,'WH-SH-01',0,0,'available')
       ON CONFLICT (sku_code, batch_no, warehouse_id) DO NOTHING`,
      [skuCode, batchNo]
    );
    await client.query(
      `INSERT INTO public.v3_inventory_movements (
        ticket_id, approval_record_id, sku_code, batch_no, movement_type, quantity_delta, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (approval_record_id, movement_type, sku_code, batch_no) DO NOTHING`,
      [ticket.id, approvalRecordId, skuCode, batchNo, execution.movementType, execution.quantityDelta ?? 0, execution.action]
    );
    await client.query(
      `UPDATE public.v3_inventory_items
       SET quantity = quantity + $3, locked_quantity = 0, status = 'available', updated_at = NOW()
       WHERE sku_code = $1 AND batch_no = $2 AND warehouse_id = 'WH-SH-01'`,
      [skuCode, batchNo, execution.quantityDelta ?? 0]
    );
  }

  if (ticket.category === "quality") {
    await client.query(
      `UPDATE public.v3_scan_records
       SET batch_lock_status = $2
       WHERE ticket_id = $1`,
      [ticket.id, execution.action === "repurchase_and_recover" ? "disposed" satisfies BatchLockStatus : "released" satisfies BatchLockStatus]
    );
    await client.query(
      `UPDATE public.v3_inventory_items
       SET locked_quantity = 0, status = 'available', updated_at = NOW()
       WHERE sku_code = $1 AND batch_no = $2 AND warehouse_id = 'WH-SH-01'`,
      [skuCode, batchNo]
    );
  }

  await client.query(
    `UPDATE public.v3_exception_tickets
     SET status = 'completed',
         execution_action = $2,
         current_assignee_id = NULL,
         next_deadline_at = NULL,
         completed_at = NOW(),
         updated_at = NOW(),
         version = version + 1
     WHERE id = $1`,
    [ticket.id, execution.action]
  );
}

export async function listUsers() {
  const result = await query<{
    id: string;
    name: string;
    role: V3Role;
    tenant_id: string;
    warehouse_id: string;
    enabled: boolean;
  }>(`SELECT id, name, role, tenant_id, warehouse_id, enabled FROM public.v3_users ORDER BY enabled DESC, role, id`);
  return result.rows.map(mapUser);
}

export async function listTickets(params: {
  status?: string;
  category?: string;
  waybillNo?: string;
  assigneeId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    values.push(params.status);
    where.push(`t.status = $${values.length}`);
  }
  if (params.category) {
    values.push(params.category);
    where.push(`t.category = $${values.length}`);
  }
  if (params.waybillNo) {
    values.push(`%${params.waybillNo}%`);
    where.push(`t.waybill_no ILIKE $${values.length}`);
  }
  if (params.assigneeId) {
    values.push(params.assigneeId);
    where.push(`t.current_assignee_id = $${values.length}`);
  }
  if (params.q) {
    values.push(`%${params.q}%`);
    where.push(`(t.ticket_no ILIKE $${values.length} OR t.waybill_no ILIKE $${values.length} OR w.recipient_name ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const limitIndex = values.push(pageSize);
  const offsetIndex = values.push(offset);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const result = await query<TicketRow & WaybillRow>(
    `SELECT
       t.*,
       reporter.name AS reporter_name,
       assignee.name AS current_assignee_name,
       w.external_code, w.store_name, w.sender_name, w.sender_phone, w.sender_address,
       w.recipient_name, w.recipient_phone, w.recipient_address, w.status AS waybill_status,
       w.tenant_id, w.warehouse_id, w.skus, w.source_updated_at, w.synced_at, w.source AS waybill_source
     FROM public.v3_exception_tickets t
     JOIN public.v3_waybill_snapshots w ON w.waybill_no = t.waybill_no
     JOIN public.v3_users reporter ON reporter.id = t.reporter_id
     LEFT JOIN public.v3_users assignee ON assignee.id = t.current_assignee_id
     ${whereSql}
     ORDER BY
       CASE WHEN t.status IN ('level1_review','level2_review') THEN 0 ELSE 1 END,
       t.next_deadline_at NULLS LAST,
       t.updated_at DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );

  const count = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM public.v3_exception_tickets t
     JOIN public.v3_waybill_snapshots w ON w.waybill_no = t.waybill_no
     ${whereSql}`,
    values.slice(0, -2)
  );

  return {
    items: result.rows.map((row) =>
      mapTicket({
        ...row,
        status: row.status,
        amount: row.amount,
      })
    ),
    total: count.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetail> {
  const ticketResult = await query<TicketRow & WaybillRow>(
    `SELECT
       t.*,
       reporter.name AS reporter_name,
       assignee.name AS current_assignee_name,
       w.external_code, w.store_name, w.sender_name, w.sender_phone, w.sender_address,
       w.recipient_name, w.recipient_phone, w.recipient_address, w.status AS waybill_status,
       w.tenant_id, w.warehouse_id, w.skus, w.source_updated_at, w.synced_at, w.source AS waybill_source
     FROM public.v3_exception_tickets t
     JOIN public.v3_waybill_snapshots w ON w.waybill_no = t.waybill_no
     JOIN public.v3_users reporter ON reporter.id = t.reporter_id
     LEFT JOIN public.v3_users assignee ON assignee.id = t.current_assignee_id
     WHERE t.id = $1`,
    [ticketId]
  );
  const row = ticketResult.rows[0];
  if (!row) throw new WorkflowError("工单不存在", 404);

  const [approvalResult, compensationResult, movementResult, scanResult] = await Promise.all([
    query<{
      id: string;
      ticket_id: string;
      actor_id: string;
      actor_name: string | null;
      action: string;
      result: string;
      level: number;
      comment: string;
      from_status: TicketStatus;
      to_status: TicketStatus;
      idempotency_key: string | null;
      created_at: string;
    }>(
      `SELECT a.*, u.name AS actor_name
       FROM public.v3_approval_records a
       JOIN public.v3_users u ON u.id = a.actor_id
       WHERE a.ticket_id = $1
       ORDER BY a.created_at DESC`,
      [ticketId]
    ),
    query<{
      id: string;
      ticket_id: string;
      approval_record_id: string;
      amount: string;
      direction: CompensationDirection;
      status: string;
      counterparty: string;
      created_at: string;
    }>(`SELECT * FROM public.v3_compensation_records WHERE ticket_id = $1 ORDER BY created_at DESC`, [ticketId]),
    query<{
      id: string;
      ticket_id: string;
      approval_record_id: string;
      sku_code: string;
      batch_no: string;
      movement_type: string;
      quantity_delta: string;
      reason: string;
      created_at: string;
    }>(`SELECT * FROM public.v3_inventory_movements WHERE ticket_id = $1 ORDER BY created_at DESC`, [ticketId]),
    query<{
      id: string;
      waybill_no: string;
      sku_code: string;
      batch_no: string;
      operator_id: string;
      device_code: string;
      judgement: ScanJudgement;
      exception_description: string;
      matched_rule_id: string | null;
      rule_snapshot: Record<string, unknown>;
      batch_lock_status: BatchLockStatus;
      ticket_id: string | null;
      created_at: string;
    }>(`SELECT * FROM public.v3_scan_records WHERE ticket_id = $1 ORDER BY created_at DESC`, [ticketId]),
  ]);

  return {
    ...mapTicket(row),
    approvals: approvalResult.rows.map(mapApproval),
    compensations: compensationResult.rows.map((item): CompensationRecord => ({
      id: item.id,
      ticketId: item.ticket_id,
      approvalRecordId: item.approval_record_id,
      amount: Number(item.amount),
      direction: item.direction,
      status: item.status,
      counterparty: item.counterparty,
      createdAt: item.created_at,
    })),
    inventoryMovements: movementResult.rows.map((item): InventoryMovement => ({
      id: item.id,
      ticketId: item.ticket_id,
      approvalRecordId: item.approval_record_id,
      skuCode: item.sku_code,
      batchNo: item.batch_no,
      movementType: item.movement_type,
      quantityDelta: Number(item.quantity_delta),
      reason: item.reason,
      createdAt: item.created_at,
    })),
    scans: scanResult.rows.map((item): ScanRecord => ({
      id: item.id,
      waybillNo: item.waybill_no,
      skuCode: item.sku_code,
      batchNo: item.batch_no,
      operatorId: item.operator_id,
      deviceCode: item.device_code,
      judgement: item.judgement,
      exceptionDescription: item.exception_description,
      matchedRuleId: item.matched_rule_id,
      ruleSnapshot: item.rule_snapshot,
      batchLockStatus: item.batch_lock_status,
      ticketId: item.ticket_id,
      createdAt: item.created_at,
    })),
  };
}

export async function createManualTicket(input: {
  waybillNo: string;
  exceptionType: LogisticsExceptionType;
  amount?: number;
  description: string;
  reporterId: string;
}) {
  const actor = await getActor(input.reporterId);
  assertRole(actor, ["operator"]);
  const { snapshot } = await fetchWaybillFromV2(input.waybillNo.trim(), { allowCacheFallback: false });
  if (snapshot.tenantId !== actor.tenantId || snapshot.warehouseId !== actor.warehouseId) {
    throw new WorkflowError("无权对其他租户或仓库的运单上报异常", 403);
  }

  const maxSubmitCount = await getSettingNumber("max_resubmit_count", 2);
  const amount = Number(input.amount || snapshot.amount || 0);
  const rule = await getApprovalRule("logistics", amount);
  const assigneeId = await getAssigneeForLevel(1);
  const deadline = addHours(rule?.level1TimeoutHours ?? 24);

  const result = await query<TicketRow>(
    `INSERT INTO public.v3_exception_tickets (
      ticket_no, source, category, exception_type, waybill_no, amount, reporter_id,
      current_assignee_id, status, approval_level, max_submit_count, description, next_deadline_at
    ) VALUES ($1,'manual','logistics',$2,$3,$4,$5,$6,'level1_review',1,$7,$8,$9)
    RETURNING *`,
    [createTicketNo(), input.exceptionType, snapshot.waybillNo, amount, actor.id, assigneeId, maxSubmitCount, input.description.trim(), deadline]
  );
  return getTicketDetail(result.rows[0].id);
}

export async function listQualityRules() {
  const result = await query<{
    id: string;
    name: string;
    subtype: QualityExceptionType;
    severity: "low" | "medium" | "high";
    auto_create_ticket: boolean;
    target_approval_level: number;
    condition: QualityRule["condition"];
    enabled: boolean;
    priority: number;
    updated_at: string;
  }>(
    `SELECT id, name, subtype, severity, auto_create_ticket, target_approval_level, condition, enabled, priority, updated_at
     FROM public.v3_quality_rules
     ORDER BY enabled DESC, priority ASC, updated_at DESC`
  );
  return result.rows.map(mapQualityRule);
}

export async function listApprovalRules() {
  const result = await query<{
    id: string;
    name: string;
    category: TicketCategory;
    min_amount: string;
    max_amount: string | null;
    target_level: number;
    level1_timeout_hours: number;
    level2_timeout_hours: number;
    enabled: boolean;
    updated_at: string;
  }>(
    `SELECT id, name, category, min_amount, max_amount, target_level, level1_timeout_hours, level2_timeout_hours, enabled, updated_at
     FROM public.v3_approval_rules
     ORDER BY category, min_amount`
  );
  return result.rows.map(mapApprovalRule);
}

export async function updateApprovalRule(input: {
  id: string;
  minAmount: number;
  maxAmount: number | null;
  targetLevel: number;
  level1TimeoutHours: number;
  level2TimeoutHours: number;
  enabled: boolean;
}) {
  const result = await query<{
    id: string;
    name: string;
    category: TicketCategory;
    min_amount: string;
    max_amount: string | null;
    target_level: number;
    level1_timeout_hours: number;
    level2_timeout_hours: number;
    enabled: boolean;
    updated_at: string;
  }>(
    `UPDATE public.v3_approval_rules
     SET min_amount = $2,
         max_amount = $3,
         target_level = $4,
         level1_timeout_hours = $5,
         level2_timeout_hours = $6,
         enabled = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, category, min_amount, max_amount, target_level, level1_timeout_hours, level2_timeout_hours, enabled, updated_at`,
    [
      input.id,
      input.minAmount,
      input.maxAmount,
      input.targetLevel,
      input.level1TimeoutHours,
      input.level2TimeoutHours,
      input.enabled,
    ]
  );
  if (!result.rows[0]) throw new WorkflowError("审批规则不存在", 404);
  return mapApprovalRule(result.rows[0]);
}

export async function updateQualityRule(input: {
  id: string;
  severity: "low" | "medium" | "high";
  targetApprovalLevel: number;
  condition: QualityRule["condition"];
  enabled: boolean;
  priority: number;
}) {
  const result = await query<{
    id: string;
    name: string;
    subtype: QualityExceptionType;
    severity: "low" | "medium" | "high";
    auto_create_ticket: boolean;
    target_approval_level: number;
    condition: QualityRule["condition"];
    enabled: boolean;
    priority: number;
    updated_at: string;
  }>(
    `UPDATE public.v3_quality_rules
     SET severity = $2,
         target_approval_level = $3,
         condition = $4::jsonb,
         enabled = $5,
         priority = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, subtype, severity, auto_create_ticket, target_approval_level, condition, enabled, priority, updated_at`,
    [input.id, input.severity, input.targetApprovalLevel, JSON.stringify(input.condition), input.enabled, input.priority]
  );
  if (!result.rows[0]) throw new WorkflowError("品控规则不存在", 404);
  return mapQualityRule(result.rows[0]);
}

function compareMetric(actual: unknown, operator: QualityRule["condition"]["operator"], expected: number | boolean) {
  if (operator === "=") return actual === expected;
  const left = Number(actual ?? 0);
  const right = Number(expected);
  if (operator === ">=") return left >= right;
  if (operator === ">") return left > right;
  if (operator === "<=") return left <= right;
  return left < right;
}

function findMatchedQualityRule(rules: QualityRule[], metrics: Record<string, unknown>) {
  return rules.find((rule) => rule.enabled && compareMetric(metrics[rule.condition.metric], rule.condition.operator, rule.condition.value));
}

export async function scanWaybill(input: {
  waybillNo: string;
  skuCode: string;
  batchNo: string;
  operatorId: string;
  deviceCode?: string;
  description?: string;
  quantityDeltaPercent?: number;
  damageLevel?: number;
  specDeviationMm?: number;
  labelMatched?: boolean;
  batchAgeDays?: number;
}) {
  const actor = await getActor(input.operatorId);
  assertRole(actor, ["operator"]);
  await validateSkuWithV2(input.waybillNo.trim(), input.skuCode.trim());
  const snapshot = await getCachedWaybillSnapshot(input.waybillNo.trim());
  if (!snapshot) throw new WorkflowError("V2 已校验运单，但本地快照写入失败", 500);

  const rules = await listQualityRules();
  const metrics = {
    quantity_delta_percent: Number(input.quantityDeltaPercent || 0),
    damage_level: Number(input.damageLevel || 0),
    spec_deviation_mm: Number(input.specDeviationMm || 0),
    label_matched: input.labelMatched ?? true,
    batch_age_days: Number(input.batchAgeDays || 0),
  };
  const matchedRule = findMatchedQualityRule(rules, metrics);
  const batchNo = input.batchNo.trim() || `${snapshot.waybillNo}-${input.skuCode.trim()}`;

  if (!matchedRule) {
    const result = await query<{ id: string }>(
      `INSERT INTO public.v3_scan_records (
        waybill_no, sku_code, batch_no, operator_id, device_code, judgement,
        exception_description, batch_lock_status
      ) VALUES ($1,$2,$3,$4,$5,'pass',$6,'outbound_ready')
      RETURNING id`,
      [snapshot.waybillNo, input.skuCode.trim(), batchNo, actor.id, input.deviceCode || "", input.description || "品控通过"]
    );
    return { judgement: "pass" as ScanJudgement, scanId: result.rows[0].id, message: "品控通过，批次可出库。" };
  }

  const maxSubmitCount = await getSettingNumber("max_resubmit_count", 2);
  const holdTimeoutHours = await getSettingNumber("qc_hold_timeout_hours", 2);

  return withClient(async (client) => {
    const openTicket = await client.query<{ id: string; ticket_no: string; status: TicketStatus }>(
      `SELECT id, ticket_no, status
       FROM public.v3_exception_tickets
       WHERE category = 'quality'
         AND waybill_no = $1
         AND sku_code = $2
         AND batch_no = $3
         AND status NOT IN ('completed', 'closed')
       LIMIT 1
       FOR UPDATE`,
      [snapshot.waybillNo, input.skuCode.trim(), batchNo]
    );

    if (openTicket.rows[0]) {
      const scan = await client.query<{ id: string }>(
        `INSERT INTO public.v3_scan_records (
          waybill_no, sku_code, batch_no, operator_id, device_code, judgement,
          exception_description, matched_rule_id, rule_snapshot, batch_lock_status, ticket_id
        ) VALUES ($1,$2,$3,$4,$5,'abnormal',$6,$7,$8::jsonb,'qc_hold',$9)
        RETURNING id`,
        [
          snapshot.waybillNo,
          input.skuCode.trim(),
          batchNo,
          actor.id,
          input.deviceCode || "",
          input.description || matchedRule.name,
          matchedRule.id,
          JSON.stringify({ rule: matchedRule, metrics }),
          openTicket.rows[0].id,
        ]
      );
      return {
        judgement: "abnormal" as ScanJudgement,
        scanId: scan.rows[0].id,
        ticketId: openTicket.rows[0].id,
        createdTicket: false,
        message: "该批次已存在未关闭品控工单，本次扫描已追加记录。",
      };
    }

    const assigneeId = await getAssigneeForLevel(matchedRule.targetApprovalLevel, client);
    await client.query(
      `INSERT INTO public.v3_inventory_items (sku_code, batch_no, warehouse_id, quantity, locked_quantity, status)
       VALUES ($1,$2,$3,0,1,'qc_hold')
       ON CONFLICT (sku_code, batch_no, warehouse_id) DO UPDATE
       SET locked_quantity = GREATEST(public.v3_inventory_items.locked_quantity, 1),
           status = 'qc_hold',
           updated_at = NOW()`,
      [input.skuCode.trim(), batchNo, snapshot.warehouseId]
    );

    const ticket = await client.query<TicketRow>(
      `INSERT INTO public.v3_exception_tickets (
        ticket_no, source, category, exception_type, waybill_no, sku_code, batch_no, amount,
        reporter_id, current_assignee_id, status, approval_level, max_submit_count,
        description, next_deadline_at, hold_deadline_at
      ) VALUES ($1,'scan','quality',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        createTicketNo("QC"),
        matchedRule.subtype,
        snapshot.waybillNo,
        input.skuCode.trim(),
        batchNo,
        snapshot.amount,
        actor.id,
        assigneeId,
        matchedRule.targetApprovalLevel >= 2 ? "level2_review" : "level1_review",
        matchedRule.targetApprovalLevel,
        maxSubmitCount,
        input.description || matchedRule.name,
        addHours(matchedRule.targetApprovalLevel >= 2 ? 48 : 24),
        addHours(holdTimeoutHours),
      ]
    );

    const scan = await client.query<{ id: string }>(
      `INSERT INTO public.v3_scan_records (
        waybill_no, sku_code, batch_no, operator_id, device_code, judgement,
        exception_description, matched_rule_id, rule_snapshot, batch_lock_status, ticket_id
      ) VALUES ($1,$2,$3,$4,$5,'abnormal',$6,$7,$8::jsonb,'qc_hold',$9)
      RETURNING id`,
      [
        snapshot.waybillNo,
        input.skuCode.trim(),
        batchNo,
        actor.id,
        input.deviceCode || "",
        input.description || matchedRule.name,
        matchedRule.id,
        JSON.stringify({ rule: matchedRule, metrics }),
        ticket.rows[0].id,
      ]
    );

    return {
      judgement: "abnormal" as ScanJudgement,
      scanId: scan.rows[0].id,
      ticketId: ticket.rows[0].id,
      createdTicket: true,
      message: "命中品控规则，批次已暂扣并自动创建工单。",
    };
  });
}

export async function approveTicket(input: {
  ticketId: string;
  actorId: string;
  decision: ApprovalDecision;
  comment: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}) {
  const result = await withClient(async (client) => {
    if (input.idempotencyKey) {
      const duplicate = await client.query<{ ticket_id: string }>(
        `SELECT ticket_id FROM public.v3_approval_records WHERE idempotency_key = $1 LIMIT 1`,
        [input.idempotencyKey]
      );
      if (duplicate.rows[0]) return { ticketId: duplicate.rows[0].ticket_id, duplicate: true };
    }

    const actor = await getActor(input.actorId, client);
    const ticketResult = await client.query<TicketRow>(
      `SELECT * FROM public.v3_exception_tickets WHERE id = $1 FOR UPDATE`,
      [input.ticketId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw new WorkflowError("工单不存在", 404);
    if (input.expectedVersion && ticket.version !== input.expectedVersion) {
      throw new WorkflowError("该工单已被处理，请刷新后重试", 409);
    }
    if (!["level1_review", "level2_review"].includes(ticket.status)) {
      throw new WorkflowError("当前状态不可审批", 409);
    }
    if (ticket.reporter_id === actor.id && actor.role !== "admin") {
      throw new WorkflowError("上报人不能审批自己提交的工单", 403);
    }
    if (ticket.current_assignee_id && ticket.current_assignee_id !== actor.id && actor.role !== "admin") {
      throw new WorkflowError("该工单已分配给其他审批人", 403);
    }
    if (ticket.status === "level1_review") assertRole(actor, ["level1_approver"]);
    if (ticket.status === "level2_review") assertRole(actor, ["level2_approver"]);

    if (input.decision === "reject") {
      const toStatus: TicketStatus = ticket.submit_count >= ticket.max_submit_count ? "closed" : "rejected";
      const approvalId = await insertApprovalRecord(client, {
        ticketId: ticket.id,
        actorId: actor.id,
        action: "reject",
        result: "rejected",
        level: ticket.approval_level,
        comment: input.comment,
        fromStatus: ticket.status,
        toStatus,
        idempotencyKey: input.idempotencyKey,
      });
      await client.query(
        `UPDATE public.v3_exception_tickets
         SET status = $2,
             current_assignee_id = CASE WHEN $2 = 'rejected' THEN reporter_id ELSE NULL END,
             next_deadline_at = NULL,
             updated_at = NOW(),
             version = version + 1
         WHERE id = $1`,
        [ticket.id, toStatus]
      );
      return { ticketId: ticket.id, approvalId };
    }

    const rule = await getApprovalRule(ticket.category, Number(ticket.amount), client);
    const shouldEscalate = ticket.status === "level1_review" && (rule?.targetLevel ?? 1) >= 2;
    if (shouldEscalate) {
      const assigneeId = await getAssigneeForLevel(2, client);
      const approvalId = await insertApprovalRecord(client, {
        ticketId: ticket.id,
        actorId: actor.id,
        action: "approve",
        result: "escalated",
        level: 1,
        comment: input.comment,
        fromStatus: ticket.status,
        toStatus: "level2_review",
        idempotencyKey: input.idempotencyKey,
      });
      await client.query(
        `UPDATE public.v3_exception_tickets
         SET status = 'level2_review',
             approval_level = 2,
             current_assignee_id = $2,
             next_deadline_at = $3,
             updated_at = NOW(),
             version = version + 1
         WHERE id = $1`,
        [ticket.id, assigneeId, addHours(rule?.level2TimeoutHours ?? 48)]
      );
      return { ticketId: ticket.id, approvalId };
    }

    const approvalId = await insertApprovalRecord(client, {
      ticketId: ticket.id,
      actorId: actor.id,
      action: "approve",
      result: "approved",
      level: ticket.approval_level,
      comment: input.comment,
      fromStatus: ticket.status,
      toStatus: "completed",
      idempotencyKey: input.idempotencyKey,
    });
    await executeApprovedTicket(client, ticket, approvalId);
    return { ticketId: ticket.id, approvalId };
  });

  return getTicketDetail(result.ticketId);
}

export async function quickReleaseTicket(input: { ticketId: string; actorId: string; reason: string }) {
  const result = await withClient(async (client) => {
    const actor = await getActor(input.actorId, client);
    assertRole(actor, ["quality_supervisor"]);
    const ticketResult = await client.query<TicketRow>(
      `SELECT * FROM public.v3_exception_tickets WHERE id = $1 FOR UPDATE`,
      [input.ticketId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw new WorkflowError("工单不存在", 404);
    if (ticket.category !== "quality") throw new WorkflowError("仅品控工单支持误判快速放行", 400);
    if (["completed", "closed"].includes(ticket.status)) throw new WorkflowError("工单已关闭", 409);
    const approvalId = await insertApprovalRecord(client, {
      ticketId: ticket.id,
      actorId: actor.id,
      action: "quick_release",
      result: "released",
      level: 0,
      comment: input.reason,
      fromStatus: ticket.status,
      toStatus: "completed",
    });
    await client.query(
      `UPDATE public.v3_scan_records SET batch_lock_status = 'released' WHERE ticket_id = $1`,
      [ticket.id]
    );
    await client.query(
      `UPDATE public.v3_inventory_items
       SET locked_quantity = 0, status = 'available', updated_at = NOW()
       WHERE sku_code = $1 AND batch_no = $2`,
      [ticket.sku_code || "", ticket.batch_no || ""]
    );
    await client.query(
      `UPDATE public.v3_exception_tickets
       SET status = 'completed',
           execution_action = 'quick_release',
           current_assignee_id = NULL,
           next_deadline_at = NULL,
           completed_at = NOW(),
           updated_at = NOW(),
           version = version + 1
       WHERE id = $1`,
      [ticket.id]
    );
    return { ticketId: ticket.id, approvalId };
  });
  return getTicketDetail(result.ticketId);
}

export async function resubmitTicket(input: { ticketId: string; actorId: string; description: string }) {
  const result = await withClient(async (client) => {
    const actor = await getActor(input.actorId, client);
    const ticketResult = await client.query<TicketRow>(
      `SELECT * FROM public.v3_exception_tickets WHERE id = $1 FOR UPDATE`,
      [input.ticketId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw new WorkflowError("工单不存在", 404);
    if (ticket.status !== "rejected") throw new WorkflowError("仅已驳回工单可重新提交", 409);
    if (ticket.reporter_id !== actor.id && actor.role !== "admin") throw new WorkflowError("只有上报人可重新提交", 403);
    if (ticket.submit_count >= ticket.max_submit_count) throw new WorkflowError("已超过重新提交次数上限", 409);
    const level = ticket.category === "quality" ? 2 : 1;
    const assigneeId = await getAssigneeForLevel(level, client);
    const toStatus: TicketStatus = level >= 2 ? "level2_review" : "level1_review";
    await insertApprovalRecord(client, {
      ticketId: ticket.id,
      actorId: actor.id,
      action: "resubmit",
      result: "submitted",
      level,
      comment: input.description,
      fromStatus: ticket.status,
      toStatus,
    });
    await client.query(
      `UPDATE public.v3_exception_tickets
       SET status = $2,
           approval_level = $3,
           current_assignee_id = $4,
           description = $5,
           submit_count = submit_count + 1,
           next_deadline_at = $6,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $1`,
      [ticket.id, toStatus, level, assigneeId, input.description, addHours(level >= 2 ? 48 : 24)]
    );
    return { ticketId: ticket.id };
  });
  return getTicketDetail(result.ticketId);
}

export async function runMaintenanceJobs() {
  return withClient(async (client) => {
    let reassigned = 0;
    let escalated = 0;
    let autoRejected = 0;

    const disabledAssignments = await client.query<TicketRow>(
      `SELECT t.*
       FROM public.v3_exception_tickets t
       JOIN public.v3_users u ON u.id = t.current_assignee_id
       WHERE u.enabled = FALSE AND t.status IN ('level1_review','level2_review')
       FOR UPDATE`
    );
    for (const ticket of disabledAssignments.rows) {
      const assigneeId = await getAssigneeForLevel(ticket.status === "level2_review" ? 2 : 1, client);
      await client.query(
        `UPDATE public.v3_exception_tickets
         SET current_assignee_id = $2, updated_at = NOW(), version = version + 1
         WHERE id = $1`,
        [ticket.id, assigneeId]
      );
      await insertApprovalRecord(client, {
        ticketId: ticket.id,
        actorId: "u-admin",
        action: "disabled_assignee_reassign",
        result: "reassigned",
        level: ticket.approval_level,
        comment: "审批人禁用，系统自动转交同级可用审批人。",
        fromStatus: ticket.status,
        toStatus: ticket.status,
      });
      reassigned += 1;
    }

    const expiredHolds = await client.query<TicketRow>(
      `SELECT * FROM public.v3_exception_tickets
       WHERE category = 'quality'
         AND status = 'level1_review'
         AND hold_deadline_at IS NOT NULL
         AND hold_deadline_at < NOW()
       FOR UPDATE`
    );
    for (const ticket of expiredHolds.rows) {
      const assigneeId = await getAssigneeForLevel(2, client);
      await client.query(
        `UPDATE public.v3_exception_tickets
         SET status = 'level2_review',
             approval_level = 2,
             current_assignee_id = $2,
             next_deadline_at = $3,
             updated_at = NOW(),
             version = version + 1
         WHERE id = $1`,
        [ticket.id, assigneeId, addHours(48)]
      );
      await insertApprovalRecord(client, {
        ticketId: ticket.id,
        actorId: "u-admin",
        action: "qc_hold_timeout_escalate",
        result: "escalated",
        level: 2,
        comment: "品控暂扣超时，系统强制升级二级审批。",
        fromStatus: ticket.status,
        toStatus: "level2_review",
      });
      escalated += 1;
    }

    const expiredApprovals = await client.query<TicketRow>(
      `SELECT * FROM public.v3_exception_tickets
       WHERE status IN ('level1_review','level2_review')
         AND next_deadline_at IS NOT NULL
         AND next_deadline_at < NOW()
       FOR UPDATE`
    );
    for (const ticket of expiredApprovals.rows) {
      if (ticket.status === "level1_review") {
        const assigneeId = await getAssigneeForLevel(2, client);
        await client.query(
          `UPDATE public.v3_exception_tickets
           SET status = 'level2_review',
               approval_level = 2,
               current_assignee_id = $2,
               next_deadline_at = $3,
               updated_at = NOW(),
               version = version + 1
           WHERE id = $1`,
          [ticket.id, assigneeId, addHours(48)]
        );
        await insertApprovalRecord(client, {
          ticketId: ticket.id,
          actorId: "u-admin",
          action: "approval_timeout_escalate",
          result: "escalated",
          level: 2,
          comment: "一级审批超时，系统自动升级二级审批。",
          fromStatus: ticket.status,
          toStatus: "level2_review",
        });
        escalated += 1;
      } else {
        const toStatus: TicketStatus = ticket.submit_count >= ticket.max_submit_count ? "closed" : "rejected";
        await client.query(
          `UPDATE public.v3_exception_tickets
           SET status = $2,
               current_assignee_id = CASE WHEN $2 = 'rejected' THEN reporter_id ELSE NULL END,
               next_deadline_at = NULL,
               updated_at = NOW(),
               version = version + 1
           WHERE id = $1`,
          [ticket.id, toStatus]
        );
        await insertApprovalRecord(client, {
          ticketId: ticket.id,
          actorId: "u-admin",
          action: "approval_timeout_reject",
          result: toStatus,
          level: ticket.approval_level,
          comment: "二级审批超时，系统自动驳回并等待上报人补充材料。",
          fromStatus: ticket.status,
          toStatus,
        });
        autoRejected += 1;
      }
    }

    return { reassigned, escalated, autoRejected };
  });
}

export async function getDashboardStats() {
  const [statusResult, sourceResult, syncResult] = await Promise.all([
    query<{ status: TicketStatus; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM public.v3_exception_tickets GROUP BY status`
    ),
    query<{ category: TicketCategory; count: number }>(
      `SELECT category, COUNT(*)::int AS count FROM public.v3_exception_tickets GROUP BY category`
    ),
    query<{ total: number; success: number; last_sync_at: string | null }>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END),0)::int AS success,
              MAX(created_at) AS last_sync_at
       FROM public.v3_sync_logs`
    ),
  ]);
  const statusCounts = Object.fromEntries(statusResult.rows.map((row) => [row.status, row.count]));
  const categoryCounts = Object.fromEntries(sourceResult.rows.map((row) => [row.category, row.count]));
  const sync = syncResult.rows[0] || { total: 0, success: 0, last_sync_at: null };
  return {
    statusCounts,
    categoryCounts,
    syncSuccessRate: sync.total ? Math.round((sync.success / sync.total) * 100) : 0,
    lastSyncAt: sync.last_sync_at,
  };
}

export async function seedDemoTickets(count = 220) {
  const capped = Math.min(500, Math.max(200, count));
  const statuses: TicketStatus[] = ["level1_review", "level2_review", "rejected", "completed", "closed"];
  const logistics: LogisticsExceptionType[] = ["lost", "damaged", "customer_rejected", "delivery_timeout", "address_error"];
  const quality: QualityExceptionType[] = ["quantity_mismatch", "appearance_damage", "spec_mismatch", "label_error", "batch_abnormal"];

  return withClient(async (client) => {
    let inserted = 0;
    for (let i = 1; i <= capped; i += 1) {
      const category: TicketCategory = i % 3 === 0 ? "quality" : "logistics";
      const type = category === "quality" ? quality[i % quality.length] : logistics[i % logistics.length];
      const status = statuses[i % statuses.length];
      const waybillNo = `DEMO-WB-${String(i).padStart(4, "0")}`;
      const skuCode = `SKU-${String((i % 18) + 1).padStart(3, "0")}`;
      const batchNo = `BATCH-${String((i % 32) + 1).padStart(3, "0")}`;
      const amount = 80 + ((i * 37) % 4000);
      await client.query(
        `INSERT INTO public.v3_waybill_snapshots (
          waybill_no, external_code, store_name, recipient_name, recipient_phone, recipient_address,
          amount, status, tenant_id, warehouse_id, skus, source_updated_at, synced_at, source, raw_payload
        ) VALUES ($1,$1,$2,$3,$4,$5,$6,'synced','default','WH-SH-01',$7::jsonb,NOW(),NOW(),'v2_realtime',$8::jsonb)
        ON CONFLICT (waybill_no) DO UPDATE SET synced_at = NOW()`,
        [
          waybillNo,
          `门店-${(i % 20) + 1}`,
          `收件人${i}`,
          `1380000${String(i).padStart(4, "0")}`,
          `上海市测试路 ${i} 号`,
          amount,
          JSON.stringify([{ skuCode, skuName: `测试商品 ${i}`, quantity: 1 + (i % 3), spec: "常规" }]),
          JSON.stringify({ demo: true }),
        ]
      );
      const assignee = status === "level2_review" ? "u-level2" : status === "level1_review" ? "u-level1" : null;
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.v3_exception_tickets (
          ticket_no, source, category, exception_type, waybill_no, sku_code, batch_no, amount,
          reporter_id, current_assignee_id, status, approval_level, submit_count, max_submit_count,
          description, next_deadline_at, hold_deadline_at, completed_at, execution_action
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'u-operator',$9,$10,$11,$12,2,$13,$14,$15,$16,$17)
        ON CONFLICT (ticket_no) DO NOTHING
        RETURNING id`,
        [
          `V3-DEMO-${String(i).padStart(4, "0")}`,
          category === "quality" ? "scan" : "manual",
          category,
          type,
          waybillNo,
          category === "quality" ? skuCode : null,
          category === "quality" ? batchNo : null,
          amount,
          assignee,
          status,
          category === "quality" || status === "level2_review" ? 2 : 1,
          status === "rejected" ? 1 : 0,
          `模拟${category === "quality" ? "品控" : "物流"}异常，用于 200+ 数据分页筛选验证。`,
          ["level1_review", "level2_review"].includes(status) ? addHours(i % 5 === 0 ? 2 : 24) : null,
          category === "quality" && !["completed", "closed"].includes(status) ? addHours(2) : null,
          status === "completed" ? new Date().toISOString() : null,
          status === "completed" ? "seed_completed" : null,
        ]
      );
      if (result.rows[0]) inserted += 1;
      if (category === "quality") {
        const ticketId = result.rows[0]?.id;
        if (ticketId) {
          await client.query(
            `INSERT INTO public.v3_scan_records (
              waybill_no, sku_code, batch_no, operator_id, device_code, judgement,
              exception_description, batch_lock_status, ticket_id
            ) VALUES ($1,$2,$3,'u-operator','SIM-01','abnormal','模拟扫描异常',$4,$5)`,
            [waybillNo, skuCode, batchNo, status === "completed" ? "released" : "qc_hold", ticketId]
          );
        }
      }
    }
    return { requested: capped, inserted };
  });
}
