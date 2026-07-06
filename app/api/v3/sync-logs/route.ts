import { jsonOk } from "@/lib/server/http";
import { listSyncLogs } from "@/lib/server/v2-client";
import { routeError } from "@/lib/server/v3-http";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const logs = await listSyncLogs(Number(searchParams.get("limit") || "30"));
    const total = logs.length;
    const success = logs.filter((log) => log.success).length;
    return jsonOk({
      logs,
      summary: {
        total,
        success,
        successRate: total ? Math.round((success / total) * 100) : 0,
        lastSyncAt: logs[0]?.createdAt || null,
      },
    });
  } catch (error) {
    return routeError(error, "加载同步日志失败");
  }
}
