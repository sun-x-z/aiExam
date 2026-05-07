import { TEMPERATURE_OPTIONS, type ImportField, type ImportRow, type ValidationIssue } from "@/lib/types";
import { REQUIRED_FIELDS } from "@/lib/import/constants";

const PHONE_PATTERN = /^[0-9+\-()\s]{6,20}$/;

function pushIssue(issues: ValidationIssue[], rowNumber: number, field: ImportField | "global", code: string, message: string) {
  issues.push({ rowNumber, field, code, message });
}

export function validateImportRow(row: ImportRow, rowIndexMap: Map<string, number>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rowNumber = row.sourceRowNumber;

  for (const field of REQUIRED_FIELDS) {
    if (!String(row.values[field] || "").trim()) {
      pushIssue(issues, rowNumber, field, "required", `${field} 不能为空`);
    }
  }

  const senderPhone = String(row.values.senderPhone || "").trim();
  const recipientPhone = String(row.values.recipientPhone || "").trim();
  if (senderPhone && !PHONE_PATTERN.test(senderPhone)) {
    pushIssue(issues, rowNumber, "senderPhone", "phone_format", "发件人电话格式错误");
  }
  if (recipientPhone && !PHONE_PATTERN.test(recipientPhone)) {
    pushIssue(issues, rowNumber, "recipientPhone", "phone_format", "收件人电话格式错误");
  }

  const weight = Number(row.values.weightKg);
  if (!Number.isFinite(weight) || weight <= 0) {
    pushIssue(issues, rowNumber, "weightKg", "weight_positive", "重量必须为正数");
  }

  const count = Number(row.values.packageCount);
  if (!Number.isInteger(count) || count <= 0) {
    pushIssue(issues, rowNumber, "packageCount", "count_positive", "件数必须为正整数");
  }

  const temperature = String(row.values.temperatureZone || "").trim();
  if (temperature && !TEMPERATURE_OPTIONS.includes(temperature as (typeof TEMPERATURE_OPTIONS)[number])) {
    pushIssue(issues, rowNumber, "temperatureZone", "temperature_range", "温层必须为 常温 / 冷藏 / 冷冻");
  }

  const externalCode = String(row.values.externalCode || "").trim();
  if (externalCode) {
    const duplicatedRow = rowIndexMap.get(externalCode);
    if (duplicatedRow && duplicatedRow !== rowNumber) {
      pushIssue(issues, rowNumber, "externalCode", "external_code_duplicate_batch", `外部编码与第 ${duplicatedRow} 行重复`);
    }
  }

  return issues;
}

export function validateRows(rows: ImportRow[]) {
  const batchCodeRows = new Map<string, number>();
  rows.forEach((row) => {
    const code = String(row.values.externalCode || "").trim();
    if (code && !batchCodeRows.has(code)) {
      batchCodeRows.set(code, row.sourceRowNumber);
    }
  });

  return rows.map((row) => {
    const issues = validateImportRow(row, batchCodeRows);
    return { ...row, issues };
  });
}
