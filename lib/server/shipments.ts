import type { ImportBatchRecord, ImportRow, ShipmentRecord } from "@/lib/types";
import { query, withClient } from "@/lib/server/db";

export async function createImportBatch(fileName: string, sheetName: string, templateFingerprint: string, totalCount: number) {
  const result = await query<ImportBatchRecord>(
    `INSERT INTO public.import_batches (file_name, sheet_name, template_fingerprint, total_count, status)
     VALUES ($1, $2, $3, $4, 'draft')
     RETURNING id, file_name, sheet_name, template_fingerprint, total_count, success_count, failure_count, status, created_at, updated_at`,
    [fileName, sheetName, templateFingerprint, totalCount]
  );

  return result.rows[0];
}

export async function updateBatchSummary(batchId: string, successCount: number, failureCount: number, status: ImportBatchRecord["status"] = "done") {
  await query(
    `UPDATE public.import_batches
     SET success_count = $2, failure_count = $3, status = $4, updated_at = NOW()
     WHERE id = $1`,
    [batchId, successCount, failureCount, status]
  );
}

export async function insertShipmentRows(batchId: string, rows: ImportRow[]) {
  return withClient(async (client) => {
    const inserted: Array<Pick<ShipmentRecord, "id" | "sourceRowNumber" | "externalCode">> = [];
    const failures: Array<{ rowNumber: number; message: string; field: string }> = [];

    for (const row of rows) {
      const externalCode = String(row.values.externalCode || "").trim() || null;
      const senderName = String(row.values.senderName || "").trim();
      const senderPhone = String(row.values.senderPhone || "").trim();
      const senderAddress = String(row.values.senderAddress || "").trim();
      const recipientName = String(row.values.recipientName || "").trim();
      const recipientPhone = String(row.values.recipientPhone || "").trim();
      const recipientAddress = String(row.values.recipientAddress || "").trim();
      const weightKg = Number(row.values.weightKg);
      const packageCount = Number(row.values.packageCount);
      const temperatureZone = String(row.values.temperatureZone || "").trim();
      const note = String(row.values.note || "").trim() || null;

      const hasErrors = row.issues.length > 0;
      if (hasErrors) {
        failures.push({ rowNumber: row.sourceRowNumber, message: "存在校验错误，已跳过", field: "global" });
        continue;
      }

      try {
        const duplicateCheck = externalCode
          ? await client.query<{ id: number }>(
              `SELECT id FROM public.shipments WHERE external_code = $1 LIMIT 1`,
              [externalCode]
            )
          : { rows: [] as Array<{ id: number }> };

        if (externalCode && duplicateCheck.rows[0]) {
          failures.push({ rowNumber: row.sourceRowNumber, message: "外部编码已存在于历史运单中", field: "externalCode" });
          continue;
        }

        const result = await client.query<{
          id: number;
          batch_id: string;
          external_code: string | null;
          source_row_number: number;
        }>(
          `INSERT INTO public.shipments (
            batch_id, external_code, sender_name, sender_phone, sender_address,
            recipient_name, recipient_phone, recipient_address, weight_kg, package_count,
            temperature_zone, note, source_row_number
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          RETURNING id, batch_id, external_code, source_row_number`,
          [
            batchId,
            externalCode,
            senderName,
            senderPhone,
            senderAddress,
            recipientName,
            recipientPhone,
            recipientAddress,
            weightKg,
            packageCount,
            temperatureZone,
            note,
            row.sourceRowNumber,
          ]
        );

        inserted.push({
          id: result.rows[0].id,
          sourceRowNumber: result.rows[0].source_row_number,
          externalCode: result.rows[0].external_code,
        });
      } catch (error) {
        failures.push({ rowNumber: row.sourceRowNumber, message: error instanceof Error ? error.message : "插入失败", field: "global" });
      }
    }

    return { inserted, failures };
  });
}

export async function listShipments(params: {
  q?: string;
  externalCode?: string;
  recipientName?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}) {
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.q) {
    values.push(`%${params.q}%`);
    where.push(`(external_code ILIKE $${values.length} OR recipient_name ILIKE $${values.length})`);
  }
  if (params.externalCode) {
    values.push(`%${params.externalCode}%`);
    where.push(`external_code ILIKE $${values.length}`);
  }
  if (params.recipientName) {
    values.push(`%${params.recipientName}%`);
    where.push(`recipient_name ILIKE $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    where.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (params.to) {
    values.push(params.to);
    where.push(`created_at <= $${values.length}::timestamptz`);
  }

  const offset = (params.page - 1) * params.pageSize;
  const limitIndex = values.push(params.pageSize);
  const offsetIndex = values.push(offset);
  const sql = `
    SELECT id, batch_id, external_code, sender_name, sender_phone, sender_address,
           recipient_name, recipient_phone, recipient_address, weight_kg, package_count,
           temperature_zone, note, source_row_number, created_at
    FROM public.shipments
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.shipments
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  `;

  const [itemsResult, countResult] = await Promise.all([
    query<{
      id: number;
      batch_id: string;
      external_code: string | null;
      sender_name: string;
      sender_phone: string;
      sender_address: string;
      recipient_name: string;
      recipient_phone: string;
      recipient_address: string;
      weight_kg: number;
      package_count: number;
      temperature_zone: ShipmentRecord["temperatureZone"];
      note: string | null;
      source_row_number: number;
      created_at: string;
    }>(sql, values),
    query<{ total: number }>(countSql, values.slice(0, values.length - 2)),
  ]);

  return {
    items: itemsResult.rows.map((row: (typeof itemsResult.rows)[number]) => ({
      id: row.id,
      batchId: row.batch_id,
      externalCode: row.external_code,
      senderName: row.sender_name,
      senderPhone: row.sender_phone,
      senderAddress: row.sender_address,
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      recipientAddress: row.recipient_address,
      weightKg: Number(row.weight_kg),
      packageCount: Number(row.package_count),
      temperatureZone: row.temperature_zone,
      note: row.note,
      sourceRowNumber: row.source_row_number,
      createdAt: row.created_at,
    })),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getDuplicateExternalCodes(codes: string[]) {
  const normalized = codes.map((code) => String(code || "").trim()).filter(Boolean);
  if (!normalized.length) return new Map<string, number>();

  const placeholders = normalized.map((_, index) => `$${index + 1}`).join(", ");
  const result = await query<{ external_code: string; count: number }>(
    `SELECT external_code, COUNT(*)::int AS count
     FROM public.shipments
     WHERE external_code IN (${placeholders})
     GROUP BY external_code`,
    normalized
  );

  return new Map(result.rows.map((row: (typeof result.rows)[number]) => [row.external_code, row.count]));
}
