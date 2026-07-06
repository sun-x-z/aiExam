export type V3Role = "operator" | "level1_approver" | "level2_approver" | "quality_supervisor" | "admin";

export type TicketSource = "manual" | "scan";
export type TicketCategory = "logistics" | "quality";

export type LogisticsExceptionType = "lost" | "damaged" | "customer_rejected" | "delivery_timeout" | "address_error";
export type QualityExceptionType = "quantity_mismatch" | "appearance_damage" | "spec_mismatch" | "label_error" | "batch_abnormal";
export type ExceptionType = LogisticsExceptionType | QualityExceptionType;

export type TicketStatus = "pending_review" | "level1_review" | "level2_review" | "rejected" | "executing" | "completed" | "closed";
export type ApprovalDecision = "approve" | "reject";
export type CompensationDirection = "customer_compensation" | "supplier_recovery";
export type ScanJudgement = "pass" | "abnormal";
export type BatchLockStatus = "outbound_ready" | "qc_hold" | "released" | "disposed";

export interface V3User {
  id: string;
  name: string;
  role: V3Role;
  tenantId: string;
  warehouseId: string;
  enabled: boolean;
}

export interface WaybillSku {
  skuCode: string;
  skuName: string;
  quantity: number;
  spec?: string | null;
}

export interface WaybillSnapshot {
  waybillNo: string;
  externalCode: string | null;
  storeName: string | null;
  senderName: string | null;
  senderPhone: string | null;
  senderAddress: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  amount: number;
  status: string;
  tenantId: string;
  warehouseId: string;
  skus: WaybillSku[];
  sourceUpdatedAt: string | null;
  syncedAt: string;
  source: "v2_realtime" | "local_cache";
  stale?: boolean;
}

export interface ExceptionTicket {
  id: string;
  ticketNo: string;
  source: TicketSource;
  category: TicketCategory;
  exceptionType: ExceptionType;
  waybillNo: string;
  skuCode: string | null;
  batchNo: string | null;
  amount: number;
  reporterId: string;
  reporterName?: string | null;
  currentAssigneeId: string | null;
  currentAssigneeName?: string | null;
  status: TicketStatus;
  approvalLevel: number;
  submitCount: number;
  maxSubmitCount: number;
  version: number;
  description: string;
  executionAction: string | null;
  nextDeadlineAt: string | null;
  holdDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  waybill?: WaybillSnapshot;
}

export interface ApprovalRecord {
  id: string;
  ticketId: string;
  actorId: string;
  actorName?: string | null;
  action: string;
  result: string;
  level: number;
  comment: string;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface CompensationRecord {
  id: string;
  ticketId: string;
  approvalRecordId: string;
  amount: number;
  direction: CompensationDirection;
  status: string;
  counterparty: string;
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  ticketId: string;
  approvalRecordId: string;
  skuCode: string;
  batchNo: string;
  movementType: string;
  quantityDelta: number;
  reason: string;
  createdAt: string;
}

export interface ScanRecord {
  id: string;
  waybillNo: string;
  skuCode: string;
  batchNo: string;
  operatorId: string;
  deviceCode: string;
  judgement: ScanJudgement;
  exceptionDescription: string;
  matchedRuleId: string | null;
  ruleSnapshot: Record<string, unknown>;
  batchLockStatus: BatchLockStatus;
  ticketId: string | null;
  createdAt: string;
}

export interface QualityRule {
  id: string;
  name: string;
  subtype: QualityExceptionType;
  severity: "low" | "medium" | "high";
  autoCreateTicket: boolean;
  targetApprovalLevel: number;
  condition: {
    metric: "quantity_delta_percent" | "damage_level" | "spec_deviation_mm" | "label_matched" | "batch_age_days";
    operator: ">=" | ">" | "<=" | "<" | "=";
    value: number | boolean;
  };
  enabled: boolean;
  priority: number;
  updatedAt: string;
}

export interface ApprovalRule {
  id: string;
  name: string;
  category: TicketCategory;
  minAmount: number;
  maxAmount: number | null;
  targetLevel: number;
  level1TimeoutHours: number;
  level2TimeoutHours: number;
  enabled: boolean;
  updatedAt: string;
}

export interface SyncLog {
  id: string;
  requestId: string;
  endpoint: string;
  requestSummary: Record<string, unknown>;
  responseStatus: number | null;
  success: boolean;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface TicketDetail extends ExceptionTicket {
  approvals: ApprovalRecord[];
  compensations: CompensationRecord[];
  inventoryMovements: InventoryMovement[];
  scans: ScanRecord[];
}

export const LOGISTICS_EXCEPTION_OPTIONS: Array<{ value: LogisticsExceptionType; label: string }> = [
  { value: "lost", label: "丢件" },
  { value: "damaged", label: "破损" },
  { value: "customer_rejected", label: "客户拒收" },
  { value: "delivery_timeout", label: "超时未签收" },
  { value: "address_error", label: "收货地址错误" },
];

export const QUALITY_EXCEPTION_OPTIONS: Array<{ value: QualityExceptionType; label: string }> = [
  { value: "quantity_mismatch", label: "数量不符" },
  { value: "appearance_damage", label: "外观破损" },
  { value: "spec_mismatch", label: "规格不符" },
  { value: "label_error", label: "标签错误" },
  { value: "batch_abnormal", label: "批次异常" },
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending_review: "待审批",
  level1_review: "一级审批中",
  level2_review: "二级审批中",
  rejected: "已驳回待重提",
  executing: "执行中",
  completed: "已完成",
  closed: "已关闭",
};

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  lost: "丢件",
  damaged: "破损",
  customer_rejected: "客户拒收",
  delivery_timeout: "超时未签收",
  address_error: "收货地址错误",
  quantity_mismatch: "数量不符",
  appearance_damage: "外观破损",
  spec_mismatch: "规格不符",
  label_error: "标签错误",
  batch_abnormal: "批次异常",
};
