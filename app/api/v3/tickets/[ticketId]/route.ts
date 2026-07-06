import { jsonOk } from "@/lib/server/http";
import { routeError } from "@/lib/server/v3-http";
import { getTicketDetail } from "@/lib/server/v3-workflow";

export async function GET(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await context.params;
    const ticket = await getTicketDetail(ticketId);
    return jsonOk({ ticket });
  } catch (error) {
    return routeError(error, "加载工单详情失败");
  }
}
