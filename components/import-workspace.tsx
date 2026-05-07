"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Database,
  Download,
  FileSpreadsheet,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { ImportField, ImportRow, ShipmentRecord, TemplateMapping, WorkbookTemplateMatch } from "@/lib/types";
import { FIELD_LABELS, IMPORT_FIELDS, TEMPERATURE_OPTIONS } from "@/lib/import/constants";
import { exportRowsToWorkbook } from "@/lib/export/xlsx";
import { materializeRowsWithProgress, parseWorkbookFile } from "@/lib/import/parse";
import { validateRows } from "@/lib/import/validation";

type HistoryFilterState = {
  q: string;
  externalCode: string;
  recipientName: string;
  from: string;
  to: string;
};

type ProgressState = {
  current: number;
  total: number;
  label: string;
};

type ApiHistoryResponse = {
  items: ShipmentRecord[];
  total: number;
  page: number;
  pageSize: number;
};

function makeEmptyRow(sourceRowNumber = 0): ImportRow {
  return {
    id: crypto.randomUUID(),
    sourceRowNumber,
    values: {
      externalCode: "",
      senderName: "",
      senderPhone: "",
      senderAddress: "",
      recipientName: "",
      recipientPhone: "",
      recipientAddress: "",
      weightKg: "",
      packageCount: "",
      temperatureZone: "",
      note: "",
    },
    issues: [],
  };
}

function hasErrors(row: ImportRow) {
  return row.issues.length > 0;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mergeDbDuplicates(rows: ImportRow[], duplicates: Record<string, number>) {
  return rows.map((row) => {
    const externalCode = String(row.values.externalCode || "").trim();
    const duplicateCount = externalCode ? duplicates[externalCode] : 0;
    const issues = row.issues.filter((issue) => issue.code !== "external_code_duplicate_db");

    if (duplicateCount) {
      issues.push({
        rowNumber: row.sourceRowNumber,
        field: "externalCode",
        code: "external_code_duplicate_db",
        message: `外部编码已存在历史数据（${duplicateCount} 条）`,
      });
    }

    return {
      ...row,
      duplicateInDb: Boolean(duplicateCount),
      issues,
    };
  });
}

function getIssueText(row: ImportRow, field: ImportField) {
  return row.issues.find((issue) => issue.field === field)?.message || "";
}

function getGlobalIssueText(row: ImportRow) {
  return row.issues.find((issue) => issue.field === "global")?.message || "";
}

function rebuildRows(
  match: WorkbookTemplateMatch,
  dataRows: string[][],
  duplicates: Record<string, number>,
  setProgress?: (progress: ProgressState) => void
) {
  return materializeRowsWithProgress(match, dataRows, (current, total) => {
    if (setProgress) {
      setProgress({
        current,
        total,
        label: `解析 ${current}/${total}`,
      });
    }
  }).then((rows) => mergeDbDuplicates(rows, duplicates));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload as T;
}

export function ImportWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<string[][]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [templateMatch, setTemplateMatch] = useState<WorkbookTemplateMatch | null>(null);
  const [mappingDraft, setMappingDraft] = useState<TemplateMapping["columnMapping"]>({});
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [duplicates, setDuplicates] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseProgress, setParseProgress] = useState<ProgressState>({ current: 0, total: 0, label: "" });
  const [submitProgress, setSubmitProgress] = useState<ProgressState>({ current: 0, total: 0, label: "" });
  const [submitSummary, setSubmitSummary] = useState<{ success: number; failure: number } | null>(null);
  const [history, setHistory] = useState<ApiHistoryResponse>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [filters, setFilters] = useState<HistoryFilterState>({
    q: "",
    externalCode: "",
    recipientName: "",
    from: "",
    to: "",
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  const validRowCount = useMemo(() => rows.filter((row) => !hasErrors(row)).length, [rows]);
  const errorCount = useMemo(() => rows.reduce((count, row) => count + row.issues.length, 0), [rows]);
  const invalidRowCount = rows.length - validRowCount;

  useEffect(() => {
    void loadHistory(1);
  }, []);

  async function loadHistory(page: number) {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(history.pageSize),
        q: filters.q,
        externalCode: filters.externalCode,
        recipientName: filters.recipientName,
        from: filters.from,
        to: filters.to,
      });
      const payload = await fetchJson<ApiHistoryResponse>(`/api/shipments?${params.toString()}`);
      setHistory(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载历史运单失败");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function syncDbDuplicates(nextRows: ImportRow[]) {
    const codes = unique(nextRows.map((row) => String(row.values.externalCode || "").trim()));
    if (!codes.length) {
      setDuplicates({});
      return {};
    }

    const payload = await fetchJson<{ duplicates: Record<string, number> }>("/api/shipments/check-duplicates", {
      method: "POST",
      body: JSON.stringify({ codes }),
    });
    setDuplicates(payload.duplicates);
    return payload.duplicates;
  }

  async function applyRows(nextMatch: WorkbookTemplateMatch, nextDataRows: string[][], nextDuplicates = duplicates) {
    const builtRows = await rebuildRows(nextMatch, nextDataRows, nextDuplicates, setParseProgress);
    setRows(builtRows);
    return builtRows;
  }

  async function handleFile(file: File) {
    setIsParsing(true);
    setMessage("");
    setSubmitSummary(null);
    setDuplicates({});
    setParseProgress({ current: 0, total: 0, label: "" });
    setSubmitProgress({ current: 0, total: 0, label: "" });
    try {
      setFileName(file.name);
      const parsed = await parseWorkbookFile(file);
      setSheetNames(parsed.sheets);
      setRawHeaders(parsed.rawHeaders);
      setSourceRows(parsed.sourceRows);
      setDataRows(parsed.dataRows);

      if (!parsed.match) {
        setRows([]);
        setTemplateMatch(null);
        setMappingDraft({});
        setMessage("未识别到可用模板，请检查表头或改用手动映射。");
        return;
      }

      const matched = await fetchJson<{ rule: TemplateMapping | null }>(`/api/template-rules/match`, {
        method: "POST",
        body: JSON.stringify({ fingerprint: parsed.match.fingerprint }),
      });

      const effectiveMapping = matched.rule?.columnMapping || parsed.match.mapping;
      const effectiveMatch: WorkbookTemplateMatch = {
        ...parsed.match,
        mapping: effectiveMapping,
        headerRowIndex: matched.rule?.headerRowIndex ?? parsed.match.headerRowIndex,
        sheetName: matched.rule?.sheetName ?? parsed.match.sheetName,
      };

      setTemplateMatch(effectiveMatch);
      setMappingDraft(effectiveMapping);
      const builtRows = await applyRows(effectiveMatch, parsed.dataRows, {});
      const deduped = await syncDbDuplicates(builtRows);
      setRows(mergeDbDuplicates(builtRows, deduped));
      setMessage(matched.rule ? "已自动应用已学习映射规则。" : "模板识别完成，可继续调整映射并预览数据。");
    } catch (error) {
      setRows([]);
      setTemplateMatch(null);
      setMessage(error instanceof Error ? error.message : "解析文件失败");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleRebuildWithMapping(nextMapping: TemplateMapping["columnMapping"]) {
    if (!templateMatch) return;
    setMappingDraft(nextMapping);
    try {
      const effectiveMatch: WorkbookTemplateMatch = { ...templateMatch, mapping: nextMapping };
      const builtRows = await applyRows(effectiveMatch, dataRows);
      const deduped = await syncDbDuplicates(builtRows);
      setRows(mergeDbDuplicates(builtRows, deduped));
      setTemplateMatch(effectiveMatch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新映射失败");
    }
  }

  async function handleLearnTemplate() {
    if (!templateMatch) return;
    setTemplateSaving(true);
    try {
      await fetchJson("/api/template-rules", {
        method: "POST",
        body: JSON.stringify({
          fingerprint: templateMatch.fingerprint,
          sheetName: templateMatch.sheetName,
          headerRowIndex: templateMatch.headerRowIndex,
          headerNames: rawHeaders,
          columnMapping: mappingDraft,
          confidence: templateMatch.confidence,
        }),
      });
      setMessage("映射规则已保存，下一次可自动识别。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存模板规则失败");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleExport() {
    await exportRowsToWorkbook(rows, fileName ? `${fileName.replace(/\.(xlsx|xls)$/i, "")}-preview.xlsx` : "import-preview.xlsx");
  }

  async function handleSubmit() {
    if (!templateMatch) return;
    if (rows.length === 0) {
      setMessage("请先导入数据。");
      return;
    }
    if (rows.some((row) => row.issues.length > 0)) {
      setMessage("存在错误行，请先修正后再提交。");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setSubmitSummary(null);
    try {
      const batch = await fetchJson<{ batch: { id: string } }>("/api/import-batches", {
        method: "POST",
        body: JSON.stringify({
          fileName: fileName || "import.xlsx",
          sheetName: templateMatch.sheetName,
          templateFingerprint: templateMatch.fingerprint,
          totalCount: rows.length,
        }),
      });

      const chunkSize = 100;
      let successCount = 0;
      let failureCount = 0;

      for (let index = 0; index < rows.length; index += chunkSize) {
        const chunk = rows.slice(index, index + chunkSize);
        setSubmitProgress({
          current: Math.min(index + chunk.length, rows.length),
          total: rows.length,
          label: `提交 ${Math.min(index + chunk.length, rows.length)}/${rows.length}`,
        });

        const result = await fetchJson<{ inserted: unknown[]; failures: Array<{ rowNumber: number }>; successCount: number; failureCount: number }>(
          `/api/import-batches/${batch.batch.id}/chunks`,
          {
            method: "POST",
            body: JSON.stringify({
              rows: chunk,
              successCount,
              failureCount,
              finalize: index + chunkSize >= rows.length,
            }),
          }
        );

        successCount = result.successCount;
        failureCount = result.failureCount;
      }

      setSubmitSummary({ success: successCount, failure: failureCount });
      setMessage(`提交完成：成功 ${successCount} 条，失败 ${failureCount} 条。`);
      await loadHistory(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmitting(false);
      setSubmitProgress({ current: 0, total: 0, label: "" });
    }
  }

  function updateRow(rowId: string, field: ImportField, value: string) {
    const nextRows = rows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            values: {
              ...row.values,
              [field]: value,
            },
          }
        : row
    );
    const validated = validateRows(nextRows.map((row) => ({ ...row, issues: [] })));
    setRows(mergeDbDuplicates(validated, duplicates));
    void syncDbDuplicates(validated).then((map) => setRows(mergeDbDuplicates(validated, map)));
  }

  function addBlankRow() {
    const nextSourceRow = rows.length ? Math.max(...rows.map((row) => row.sourceRowNumber)) + 1 : 1;
    const nextRows = [...rows, makeEmptyRow(nextSourceRow)];
    const validated = validateRows(nextRows.map((row) => ({ ...row, issues: [] })));
    setRows(mergeDbDuplicates(validated, duplicates));
  }

  function removeRow(rowId: string) {
    const nextRows = rows.filter((row) => row.id !== rowId);
    const validated = validateRows(nextRows.map((row) => ({ ...row, issues: [] })));
    setRows(mergeDbDuplicates(validated, duplicates));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    event.target.value = "";
  }

  const fieldOptions = rawHeaders.map((header, index) => ({ label: `${index + 1}. ${header || "空列"}`, value: String(index) }));

  return (
    <main className="min-h-screen px-4 py-6 text-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-7 shadow-panel backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">AI Exam</p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-ink md:text-5xl">
              多模板 Excel 自动导入下单系统
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--muted)]">
              支持表头自动识别、手动映射学习、批量校验、在线编辑、导出和数据库提交。
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <StatCard icon={<FileSpreadsheet className="h-4 w-4" />} title="模板识别" value={templateMatch ? "已识别" : "待上传"} />
              <StatCard icon={<ListChecks className="h-4 w-4" />} title="有效行数" value={String(validRowCount)} />
              <StatCard icon={<Database className="h-4 w-4" />} title="错误行数" value={String(invalidRowCount)} />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-7 shadow-panel backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Upload</p>
                <h2 className="mt-2 text-2xl font-semibold">上传 Excel 文件</h2>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
              >
                <Upload className="h-4 w-4" />
                选择文件
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileChange} />

            <label
              className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/60 p-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-[var(--accent)]" />
              <div>
                <p className="font-semibold">拖拽文件到此处，或点击选择</p>
                <p className="mt-1 text-sm text-[var(--muted)]">支持 .xlsx / .xls，自动识别 5 种样例模板</p>
              </div>
            </label>

            <div className="mt-5 grid gap-2 text-sm text-[var(--muted)]">
              <InfoLine label="文件" value={fileName || "未选择"} />
              <InfoLine label="识别 Sheet" value={templateMatch?.sheetName || "未识别"} />
              <InfoLine label="表头行" value={templateMatch ? String(templateMatch.headerRowIndex + 1) : "-"} />
              <InfoLine label="Sheet 列表" value={sheetNames.join(" / ") || "-"} />
            </div>

            {(isParsing || isSubmitting || submitProgress.total > 0 || parseProgress.total > 0) && (
              <div className="mt-5 space-y-4 rounded-[1.25rem] border border-[var(--line)] bg-white/70 p-4">
                <ProgressBar label={isParsing ? parseProgress.label : submitProgress.label} current={(isParsing ? parseProgress.current : submitProgress.current)} total={(isParsing ? parseProgress.total : submitProgress.total)} />
              </div>
            )}

            {message ? <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent)]">{message}</p> : null}
          </div>
        </section>

        {templateMatch ? (
          <section className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-6 shadow-panel backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Mapping</p>
                <h2 className="mt-2 text-2xl font-semibold">模板映射与学习</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleLearnTemplate()}
                  disabled={templateSaving}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {templateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  记住映射
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
                >
                  <Download className="h-4 w-4" />
                  导出预览
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  提交下单
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {IMPORT_FIELDS.map((field) => (
                <div key={field} className="rounded-[1.25rem] border border-[var(--line)] bg-white/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{FIELD_LABELS[field]}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">按住 Ctrl/Command 可多选列，支持地址拆列拼接。</p>
                    </div>
                  </div>
                  <select
                    multiple
                    size={Math.min(8, Math.max(4, rawHeaders.length || 4))}
                    value={(mappingDraft[field] || []).map(String)}
                    onChange={(event) => {
                      const selected = Array.from(event.currentTarget.selectedOptions).map((option) => Number(option.value));
                      void handleRebuildWithMapping({ ...mappingDraft, [field]: selected });
                    }}
                    className="min-h-32 w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none"
                  >
                    {fieldOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-6 shadow-panel backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Preview</p>
              <h2 className="mt-2 text-2xl font-semibold">数据预览与在线编辑</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addBlankRow}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
              >
                <Plus className="h-4 w-4" />
                新增空行
              </button>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.slice(0, -1))}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
              >
                <RotateCcw className="h-4 w-4" />
                删除最后一行
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-[1.4rem] border border-[var(--line)] bg-white/80">
            <table className="min-w-[1400px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Th>行号</Th>
                  {IMPORT_FIELDS.map((field) => (
                    <Th key={field}>{FIELD_LABELS[field]}</Th>
                  ))}
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr key={row.id} className={row.issues.length ? "bg-rose-50/70" : index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <Td className="w-16 text-center font-semibold">{row.sourceRowNumber || index + 1}</Td>
                      {IMPORT_FIELDS.map((field) => {
                        const issue = getIssueText(row, field);
                        const inputValue = row.values[field] ?? "";
                        return (
                          <Td key={field} className={issue ? "bg-rose-50/70" : ""}>
                            {field === "temperatureZone" ? (
                              <select
                                value={inputValue}
                                onChange={(event) => updateRow(row.id, field, event.target.value)}
                                className={`w-full rounded-xl border px-3 py-2 outline-none ${issue ? "border-rose-400" : "border-[var(--line)]"}`}
                              >
                                <option value="">请选择</option>
                                {TEMPERATURE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={inputValue}
                                onChange={(event) => updateRow(row.id, field, event.target.value)}
                                className={`w-full rounded-xl border px-3 py-2 outline-none ${issue ? "border-rose-400" : "border-[var(--line)]"}`}
                              />
                            )}
                            {issue ? <p className="mt-2 text-xs text-rose-600">{issue}</p> : null}
                          </Td>
                        );
                      })}
                      <Td className="text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                        {getGlobalIssueText(row) ? <p className="mt-2 text-xs text-rose-600">{getGlobalIssueText(row)}</p> : null}
                      </Td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={IMPORT_FIELDS.length + 2} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                      请先上传 Excel 文件。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-6 shadow-panel backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">History</p>
                <h2 className="mt-2 text-2xl font-semibold">已导入运单</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadHistory(1)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
              >
                <Search className="h-4 w-4" />
                刷新查询
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <InputField label="关键字" value={filters.q} onChange={(value) => setFilters((prev) => ({ ...prev, q: value }))} />
              <InputField label="外部编码" value={filters.externalCode} onChange={(value) => setFilters((prev) => ({ ...prev, externalCode: value }))} />
              <InputField label="收件人" value={filters.recipientName} onChange={(value) => setFilters((prev) => ({ ...prev, recipientName: value }))} />
              <InputField label="开始时间" value={filters.from} type="datetime-local" onChange={(value) => setFilters((prev) => ({ ...prev, from: value }))} />
              <InputField label="结束时间" value={filters.to} type="datetime-local" onChange={(value) => setFilters((prev) => ({ ...prev, to: value }))} />
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void loadHistory(1)}
                className="rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                查询
              </button>
            </div>

            <div className="mt-5 overflow-x-auto rounded-[1.4rem] border border-[var(--line)] bg-white/80">
              <table className="min-w-[1100px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <Th>外部编码</Th>
                    <Th>收件人</Th>
                    <Th>收件电话</Th>
                    <Th>温层</Th>
                    <Th>件数</Th>
                    <Th>提交时间</Th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                        加载中...
                      </td>
                    </tr>
                  ) : history.items.length ? (
                    history.items.map((item) => (
                      <tr key={item.id} className="odd:bg-white even:bg-slate-50/50">
                        <Td>{item.externalCode || "-"}</Td>
                        <Td>{item.recipientName}</Td>
                        <Td>{item.recipientPhone}</Td>
                        <Td>{item.temperatureZone}</Td>
                        <Td>{item.packageCount}</Td>
                        <Td>{new Date(item.createdAt).toLocaleString("zh-CN")}</Td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                        暂无历史运单。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
              <p>
                共 {history.total} 条，当前第 {history.page} 页
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={history.page <= 1 || historyLoading}
                  onClick={() => void loadHistory(history.page - 1)}
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={history.page * history.pageSize >= history.total || historyLoading}
                  onClick={() => void loadHistory(history.page + 1)}
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-[var(--panel)] p-6 shadow-panel backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Summary</p>
            <h2 className="mt-2 text-2xl font-semibold">导入状态</h2>

            <div className="mt-5 space-y-3">
              <SummaryLine label="文件名" value={fileName || "-"} />
              <SummaryLine label="Sheet" value={templateMatch?.sheetName || "-"} />
              <SummaryLine label="模板指纹" value={templateMatch?.fingerprint || "-"} />
              <SummaryLine label="总行数" value={String(rows.length)} />
              <SummaryLine label="有效行" value={String(validRowCount)} />
              <SummaryLine label="错误行" value={String(invalidRowCount)} />
            </div>

            <div className="mt-6 grid gap-3 rounded-[1.4rem] border border-[var(--line)] bg-white/80 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>提交结果</span>
                <span className="font-semibold text-[var(--accent)]">{submitSummary ? `${submitSummary.success} 成功 / ${submitSummary.failure} 失败` : "-"}</span>
              </div>
              <ProgressBar label={submitProgress.label} current={submitProgress.current} total={submitProgress.total} />
            </div>

            <div className="mt-6 rounded-[1.4rem] border border-[var(--line)] bg-[var(--accent-soft)] p-4 text-sm leading-7 text-[var(--accent)]">
              规则说明：有错误的行不能提交；外部编码会同时检查同批次重复和历史重复；映射规则可学习保存。
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/75 px-4 py-3">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{label || "等待任务"}</span>
        <span>
          {current}/{total || 0} · {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="sticky top-0 border-b border-[var(--line)] bg-slate-50/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{children}</th>;
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[var(--line)] px-4 py-3 align-top ${className}`}>{children}</td>;
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-[var(--line)] bg-white/80 px-3 py-2 outline-none"
      />
    </label>
  );
}
