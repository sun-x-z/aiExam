import type { TemplateMapping } from "@/lib/types";
import { query } from "@/lib/server/db";

export async function getTemplateRule(fingerprint: string) {
  const result = await query<{
    id: number;
    fingerprint: string;
    sheet_name: string;
    header_row_index: number;
    column_mapping: Record<string, number[]>;
    header_names: string[];
    confidence: number;
  }>(
    `SELECT id, fingerprint, sheet_name, header_row_index, column_mapping, header_names, confidence
     FROM public.template_rules
     WHERE fingerprint = $1
     LIMIT 1`,
    [fingerprint]
  );

  const row = result.rows[0];
  if (!row) return null;

  const mapping: TemplateMapping = {
    fingerprint: row.fingerprint,
    sheetName: row.sheet_name,
    headerRowIndex: row.header_row_index,
    columnMapping: row.column_mapping as TemplateMapping["columnMapping"],
    headerNames: row.header_names,
  };

  return {
    ...mapping,
    confidence: row.confidence,
  };
}

export async function saveTemplateRule(rule: TemplateMapping, confidence = 0) {
  await query(
    `INSERT INTO public.template_rules (fingerprint, sheet_name, header_row_index, column_mapping, header_names, confidence, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (fingerprint) DO UPDATE SET
       sheet_name = EXCLUDED.sheet_name,
       header_row_index = EXCLUDED.header_row_index,
       column_mapping = EXCLUDED.column_mapping,
       header_names = EXCLUDED.header_names,
       confidence = EXCLUDED.confidence,
       updated_at = NOW()`,
    [rule.fingerprint, rule.sheetName, rule.headerRowIndex, JSON.stringify(rule.columnMapping), JSON.stringify(rule.headerNames), confidence]
  );
}

