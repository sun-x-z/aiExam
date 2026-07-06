import { jsonOk } from "@/lib/server/http";
import { routeError } from "@/lib/server/v3-http";
import { listUsers } from "@/lib/server/v3-workflow";

export async function GET() {
  try {
    const users = await listUsers();
    return jsonOk({ users });
  } catch (error) {
    return routeError(error, "加载用户失败");
  }
}
