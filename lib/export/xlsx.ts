import type { ImportRow } from "@/lib/types";

export async function exportRowsToWorkbook(rows: ImportRow[], fileName = "import-preview.xlsx") {
  const XLSX = await import("xlsx");
  const data = rows.map((row) => ({
    外部编码: row.values.externalCode,
    发件人姓名: row.values.senderName,
    发件人电话: row.values.senderPhone,
    发件人地址: row.values.senderAddress,
    收件人姓名: row.values.recipientName,
    收件人电话: row.values.recipientPhone,
    收件人地址: row.values.recipientAddress,
    重量_kg: row.values.weightKg,
    件数: row.values.packageCount,
    温层: row.values.temperatureZone,
    备注: row.values.note,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "预览数据");
  XLSX.writeFile(workbook, fileName);
}

