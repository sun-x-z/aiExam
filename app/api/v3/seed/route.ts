import { jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { seedDemoTickets } from "@/lib/server/v3-workflow";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ count?: number }>(request);
    const result = await seedDemoTickets(Number(body.count || 220));
    return jsonOk(result);
  } catch (error) {
    return routeError(error, "生成样本数据失败");
  }
}
