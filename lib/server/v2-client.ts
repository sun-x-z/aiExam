import { query } from "@/lib/server/db";
import type { WaybillSnapshot, WaybillSku } from "@/lib/v3/types";

type V2WaybillResponse = {
  waybillNo: string;
  externalCode?: string | null;
  storeName?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  senderAddress?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientAddress?: string | null;
  amount?: number | string | null;
  status?: string | null;
  tenantId?: string | null;
  warehouseId?: string | null;
  skus?: WaybillSku[];
  sourceUpdatedAt?: string | null;
  etag?: string | null;
};

type V2SkuResponse = {
  exists: boolean;
  sku?: WaybillSku;
  waybill?: V2WaybillResponse;
};

type V2CallResult<T> = {
  data: T;
  requestId: string;
  status: number;
  durationMs: number;
};

export class V2ClientError extends Error {
  status?: number;
  requestId?: string;
  constructor(message: string, options: { status?: number; requestId?: string } = {}) {
    super(message);
    this.name = "V2ClientError";
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

function getV2BaseUrl() {
  const configured = process.env.V2_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${process.env.PORT || "3000"}`);
  return `${appUrl.replace(/\/$/, "")}/api/v2`;
}

export function getV2ApiKey() {
  return process.env.V2_API_KEY?.trim() || "local-dev-v2-key";
}

function getRetryCount() {
  return Math.max(0, Number(process.env.V2_API_RETRY_COUNT || "1"));
}

function getTimeoutMs() {
  return Math.max(1000, Number(process.env.V2_API_TIMEOUT_MS || "3500"));
}

function normalizeWaybill(payload: V2WaybillResponse): WaybillSnapshot {
  const amount = Number(payload.amount ?? 0);
  return {
    waybillNo: payload.waybillNo,
    externalCode: payload.externalCode ?? payload.waybillNo,
    storeName: payload.storeName ?? null,
    senderName: payload.senderName ?? null,
    senderPhone: payload.senderPhone ?? null,
    senderAddress: payload.senderAddress ?? null,
    recipientName: payload.recipientName ?? null,
    recipientPhone: payload.recipientPhone ?? null,
    recipientAddress: payload.recipientAddress ?? null,
    amount: Number.isFinite(amount) ? amount : 0,
    status: payload.status || "unknown",
    tenantId: payload.tenantId || "default",
    warehouseId: payload.warehouseId || "WH-SH-01",
    skus: Array.isArray(payload.skus) ? payload.skus : [],
    sourceUpdatedAt: payload.sourceUpdatedAt || null,
    syncedAt: new Date().toISOString(),
    source: "v2_realtime",
  };
}

async function writeSyncLog(input: {
  requestId: string;
  endpoint: string;
  requestSummary: Record<string, unknown>;
  responseStatus?: number | null;
  success: boolean;
  durationMs: number;
  errorMessage?: string | null;
}) {
  await query(
    `INSERT INTO public.v3_sync_logs (
      request_id, endpoint, request_summary, response_status, success, duration_ms, error_message
    ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
    [
      input.requestId,
      input.endpoint,
      JSON.stringify(input.requestSummary),
      input.responseStatus ?? null,
      input.success,
      input.durationMs,
      input.errorMessage ?? null,
    ]
  );
}

async function callV2<T>(path: string, requestSummary: Record<string, unknown>): Promise<V2CallResult<T>> {
  const requestId = crypto.randomUUID();
  const endpoint = `${getV2BaseUrl()}${path}`;
  const timeoutMs = getTimeoutMs();
  const retryCount = getRetryCount();
  let lastError: unknown = null;
  let lastStatus: number | null = null;
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-API-Key": getV2ApiKey(),
          "X-Request-ID": requestId,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      lastStatus = response.status;
      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : `V2 接口返回 ${response.status}`;
        if (response.status < 500 || attempt >= retryCount) {
          throw new V2ClientError(message, { status: response.status, requestId });
        }
        lastError = new V2ClientError(message, { status: response.status, requestId });
        continue;
      }

      const durationMs = Date.now() - startedAt;
      await writeSyncLog({
        requestId,
        endpoint: path,
        requestSummary: { ...requestSummary, attempt: attempt + 1 },
        responseStatus: response.status,
        success: true,
        durationMs,
      });
      return { data: payload as T, requestId, status: response.status, durationMs };
    } catch (error) {
      lastError = error;
      if (error instanceof V2ClientError || attempt >= retryCount) break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const durationMs = Date.now() - startedAt;
  const errorMessage = lastError instanceof Error ? lastError.message : "V2 接口调用失败";
  await writeSyncLog({
    requestId,
    endpoint: path,
    requestSummary,
    responseStatus: lastStatus,
    success: false,
    durationMs,
    errorMessage,
  });
  throw new V2ClientError(errorMessage, { status: lastStatus ?? undefined, requestId });
}

export async function upsertWaybillSnapshot(snapshot: WaybillSnapshot, rawPayload: unknown = {}) {
  await query(
    `INSERT INTO public.v3_waybill_snapshots (
      waybill_no, external_code, store_name, sender_name, sender_phone, sender_address,
      recipient_name, recipient_phone, recipient_address, amount, status, tenant_id,
      warehouse_id, skus, source_updated_at, synced_at, source, raw_payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,NOW(),'v2_realtime',$16::jsonb)
    ON CONFLICT (waybill_no) DO UPDATE SET
      external_code = EXCLUDED.external_code,
      store_name = EXCLUDED.store_name,
      sender_name = EXCLUDED.sender_name,
      sender_phone = EXCLUDED.sender_phone,
      sender_address = EXCLUDED.sender_address,
      recipient_name = EXCLUDED.recipient_name,
      recipient_phone = EXCLUDED.recipient_phone,
      recipient_address = EXCLUDED.recipient_address,
      amount = EXCLUDED.amount,
      status = EXCLUDED.status,
      tenant_id = EXCLUDED.tenant_id,
      warehouse_id = EXCLUDED.warehouse_id,
      skus = EXCLUDED.skus,
      source_updated_at = EXCLUDED.source_updated_at,
      synced_at = NOW(),
      source = 'v2_realtime',
      raw_payload = EXCLUDED.raw_payload`,
    [
      snapshot.waybillNo,
      snapshot.externalCode,
      snapshot.storeName,
      snapshot.senderName,
      snapshot.senderPhone,
      snapshot.senderAddress,
      snapshot.recipientName,
      snapshot.recipientPhone,
      snapshot.recipientAddress,
      snapshot.amount,
      snapshot.status,
      snapshot.tenantId,
      snapshot.warehouseId,
      JSON.stringify(snapshot.skus),
      snapshot.sourceUpdatedAt,
      JSON.stringify(rawPayload ?? {}),
    ]
  );
}

export async function getCachedWaybillSnapshot(waybillNo: string): Promise<WaybillSnapshot | null> {
  const result = await query<{
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
    status: string;
    tenant_id: string;
    warehouse_id: string;
    skus: WaybillSku[];
    source_updated_at: string | null;
    synced_at: string;
  }>(`SELECT * FROM public.v3_waybill_snapshots WHERE waybill_no = $1`, [waybillNo]);

  const row = result.rows[0];
  if (!row) return null;
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
    status: row.status,
    tenantId: row.tenant_id,
    warehouseId: row.warehouse_id,
    skus: row.skus || [],
    sourceUpdatedAt: row.source_updated_at,
    syncedAt: row.synced_at,
    source: "local_cache",
    stale: true,
  };
}

export async function fetchWaybillFromV2(waybillNo: string, options: { allowCacheFallback?: boolean } = {}) {
  try {
    const result = await callV2<V2WaybillResponse>(`/waybills/${encodeURIComponent(waybillNo)}`, { waybillNo });
    const snapshot = normalizeWaybill(result.data);
    await upsertWaybillSnapshot(snapshot, result.data);
    return { snapshot, requestId: result.requestId, realtime: true };
  } catch (error) {
    if (options.allowCacheFallback) {
      const cached = await getCachedWaybillSnapshot(waybillNo);
      if (cached) return { snapshot: cached, requestId: error instanceof V2ClientError ? error.requestId : undefined, realtime: false };
    }
    throw error;
  }
}

export async function validateSkuWithV2(waybillNo: string, skuCode: string) {
  const result = await callV2<V2SkuResponse>(
    `/waybills/${encodeURIComponent(waybillNo)}/skus/${encodeURIComponent(skuCode)}`,
    { waybillNo, skuCode }
  );
  if (!result.data.exists) {
    throw new V2ClientError("SKU 不属于该运单", { status: 404, requestId: result.requestId });
  }
  if (result.data.waybill) {
    const snapshot = normalizeWaybill(result.data.waybill);
    await upsertWaybillSnapshot(snapshot, result.data.waybill);
  }
  return { sku: result.data.sku, requestId: result.requestId };
}

export async function listSyncLogs(limit = 20) {
  const result = await query<{
    id: string;
    request_id: string;
    endpoint: string;
    request_summary: Record<string, unknown>;
    response_status: number | null;
    success: boolean;
    duration_ms: number;
    error_message: string | null;
    created_at: string;
  }>(
    `SELECT id, request_id, endpoint, request_summary, response_status, success, duration_ms, error_message, created_at
     FROM public.v3_sync_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    endpoint: row.endpoint,
    requestSummary: row.request_summary,
    responseStatus: row.response_status,
    success: row.success,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}
