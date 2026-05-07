import type { ImportField, ImportRow, WorkbookTemplateMatch } from "@/lib/types";
import { IMPORT_FIELDS } from "@/lib/types";
import { detectTemplateFromSheet } from "@/lib/import/detection";
import { normalizeText } from "@/lib/import/normalize";
import { validateRows } from "@/lib/import/validation";

export interface ParsedWorkbookResult {
  sheets: string[];
  match: WorkbookTemplateMatch | null;
  rawHeaders: string[];
  sourceRows: string[][];
  dataRows: string[][];
}

function cellToString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function getFieldValue(row: string[], indices: number[] | undefined) {
  if (!indices?.length) return "";
  return indices
    .map((index) => cellToString(row[index]))
    .filter(Boolean)
    .join(" ")
    .trim();
}

export async function parseWorkbookFile(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames;

  let match: WorkbookTemplateMatch | null = null;
  let sourceRows: string[][] = [];

  for (const sheetName of sheets) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: "", raw: false }) as string[][];
    const filteredRows = rows
      .map((row) => row.map((cell) => cellToString(cell)))
      .filter((row) => row.some((cell) => normalizeText(cell).length > 0));

    const candidate = detectTemplateFromSheet(sheetName, filteredRows);
    if (candidate && (!match || candidate.confidence > match.confidence)) {
      match = candidate;
      sourceRows = filteredRows;
    }
  }

  if (!match) {
    return { sheets, match: null, rawHeaders: [], sourceRows: [], dataRows: [] };
  }

  const headers = sourceRows[match.headerRowIndex] ?? [];
  const dataRows = sourceRows.slice(match.headerRowIndex + 1);

  return {
    sheets,
    match,
    rawHeaders: headers,
    sourceRows,
    dataRows,
  };
}

export function materializeRows(match: WorkbookTemplateMatch, dataRows: string[][]): ImportRow[] {
  const parsedRows: ImportRow[] = dataRows
    .filter((row) => row.some((cell) => normalizeText(cell).length > 0))
    .map((row, idx) => {
      const values = Object.fromEntries(
        IMPORT_FIELDS.map((field) => [field, getFieldValue(row, match.mapping[field])])
      ) as Record<ImportField, string>;

      return {
        id: `${match.fingerprint}:${idx + 1}`,
        sourceRowNumber: match.headerRowIndex + idx + 2,
        values,
        issues: [],
      };
    });

  return validateRows(parsedRows);
}

export async function materializeRowsWithProgress(
  match: WorkbookTemplateMatch,
  dataRows: string[][],
  onProgress?: (current: number, total: number) => void
) {
  const filteredRows = dataRows.filter((row) => row.some((cell) => normalizeText(cell).length > 0));
  const partialRows: ImportRow[] = [];
  const total = filteredRows.length;

  for (let index = 0; index < filteredRows.length; index += 1) {
    const row = filteredRows[index];
    const values = Object.fromEntries(
      IMPORT_FIELDS.map((field) => [field, getFieldValue(row, match.mapping[field])])
    ) as Record<ImportField, string>;

    partialRows.push({
      id: `${match.fingerprint}:${index + 1}`,
      sourceRowNumber: match.headerRowIndex + index + 2,
      values,
      issues: [],
    });

    if (onProgress && ((index + 1) % 40 === 0 || index === filteredRows.length - 1)) {
      onProgress(index + 1, total);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }
  }

  return validateRows(partialRows);
}
