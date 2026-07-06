import { jsonError } from "@/lib/server/http";
import { V2ClientError } from "@/lib/server/v2-client";
import { WorkflowError } from "@/lib/server/v3-workflow";

export function routeError(error: unknown, fallback = "请求处理失败") {
  if (error instanceof WorkflowError) return jsonError(error.message, error.status);
  if (error instanceof V2ClientError) {
    return jsonError(error.message, error.status || 502, { requestId: error.requestId });
  }
  return jsonError(error instanceof Error ? error.message : fallback, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}
