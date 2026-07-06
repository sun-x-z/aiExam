import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { approveTicket } from "@/lib/server/v3-workflow";
import type { ApprovalDecision } from "@/lib/v3/types";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await context.params;
    const body = await readJson<{
      actorId?: string;
      decision?: ApprovalDecision;
      comment?: string;
      expectedVersion?: number;
      idempotencyKey?: string;
    }>(request);
    if (!body.actorId || !body.decision || !body.comment) {
      return jsonError("actorId、decision、comment 均必填", 400);
    }
    const ticket = await approveTicket({
      ticketId,
      actorId: body.actorId,
      decision: body.decision,
      comment: body.comment,
      expectedVersion: body.expectedVersion,
      idempotencyKey: body.idempotencyKey,
    });
    return jsonOk({ ticket });
  } catch (error) {
    return routeError(error, "审批失败");
  }
}
