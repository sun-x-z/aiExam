export const TEMPERATURE_OPTIONS = ["常温", "冷藏", "冷冻"] as const;

export type TemperatureZone = (typeof TEMPERATURE_OPTIONS)[number];

export type ImportField =
  | "externalCode"
  | "senderName"
  | "senderPhone"
  | "senderAddress"
  | "recipientName"
  | "recipientPhone"
  | "recipientAddress"
  | "weightKg"
  | "packageCount"
  | "temperatureZone"
  | "note";

export const IMPORT_FIELDS: ImportField[] = [
  "externalCode",
  "senderName",
  "senderPhone",
  "senderAddress",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
  "weightKg",
  "packageCount",
  "temperatureZone",
  "note",
];

export interface ImportRow {
  id: string;
  sourceRowNumber: number;
  values: Record<ImportField, string>;
  issues: ValidationIssue[];
  duplicateWithRow?: number;
  duplicateInDb?: boolean;
}

export interface ValidationIssue {
  rowNumber: number;
  field: ImportField | "global";
  message: string;
  code: string;
}

export interface TemplateMapping {
  fingerprint: string;
  sheetName: string;
  headerRowIndex: number;
  columnMapping: Partial<Record<ImportField, number[]>>;
  headerNames: string[];
}

export interface WorkbookTemplateMatch {
  sheetName: string;
  headerRowIndex: number;
  headerNames: string[];
  mapping: Partial<Record<ImportField, number[]>>;
  fingerprint: string;
  confidence: number;
}

export interface ShipmentRecord {
  id: number;
  batchId: string;
  externalCode: string | null;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  weightKg: number;
  packageCount: number;
  temperatureZone: TemperatureZone;
  note: string | null;
  sourceRowNumber: number;
  createdAt: string;
}

export interface ImportBatchRecord {
  id: string;
  fileName: string;
  sheetName: string;
  templateFingerprint: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  status: "draft" | "processing" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}
