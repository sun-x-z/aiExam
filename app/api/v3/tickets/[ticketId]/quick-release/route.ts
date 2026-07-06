import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { quickReleaseTicket } from "@/lib/server/v3-workflow";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await context.params;
    const body = await readJson<{ actorId?: string; reason?: string }>(request);
    if (!body.actorId || !body.reason) return jsonError("actorId、reason 均必填", 400);
    const ticket = await quickReleaseTicket({ ticketId, actorId: body.actorId, reason: body.reason });
    return jsonOk({ ticket });
  } catch (error) {
    return routeError(error, "快速放行失败");
  }
}
