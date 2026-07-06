import { jsonOk } from "@/lib/server/http";
import { routeError } from "@/lib/server/v3-http";
import { getDashboardStats } from "@/lib/server/v3-workflow";

export async function GET() {
  try {
    const stats = await getDashboardStats();
    return jsonOk({ stats });
  } catch (error) {
    return routeError(error, "加载看板失败");
  }
}
