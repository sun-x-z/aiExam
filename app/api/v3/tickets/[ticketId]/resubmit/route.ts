import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { resubmitTicket } from "@/lib/server/v3-workflow";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await context.params;
    const body = await readJson<{ actorId?: string; description?: string }>(request);
    if (!body.actorId || !body.description) return jsonError("actorId、description 均必填", 400);
    const ticket = await resubmitTicket({ ticketId, actorId: body.actorId, description: body.description });
    return jsonOk({ ticket });
  } catch (error) {
    return routeError(error, "重新提交失败");
  }
}
