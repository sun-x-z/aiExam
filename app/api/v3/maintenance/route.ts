import { jsonOk } from "@/lib/server/http";
import { routeError } from "@/lib/server/v3-http";
import { runMaintenanceJobs } from "@/lib/server/v3-workflow";

export async function POST() {
  try {
    const result = await runMaintenanceJobs();
    return jsonOk(result);
  } catch (error) {
    return routeError(error, "维护任务执行失败");
  }
}
