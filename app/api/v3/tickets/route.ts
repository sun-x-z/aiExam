import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { createManualTicket, listTickets } from "@/lib/server/v3-workflow";
import type { LogisticsExceptionType } from "@/lib/v3/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await listTickets({
      status: searchParams.get("status") || "",
      category: searchParams.get("category") || "",
      exceptionType: searchParams.get("exceptionType") || "",
      waybillNo: searchParams.get("waybillNo") || "",
      assigneeId: searchParams.get("assigneeId") || "",
      q: searchParams.get("q") || "",
      page: Number(searchParams.get("page") || "1"),
      pageSize: Number(searchParams.get("pageSize") || "20"),
    });
    return jsonOk(result);
  } catch (error) {
    return routeError(error, "加载工单失败");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      waybillNo?: string;
      exceptionType?: LogisticsExceptionType;
      amount?: number;
      description?: string;
      reporterId?: string;
    }>(request);
    if (!body.waybillNo || !body.exceptionType || !body.description || !body.reporterId) {
      return jsonError("waybillNo、exceptionType、description、reporterId 均必填", 400);
    }
    const ticket = await createManualTicket({
      waybillNo: body.waybillNo,
      exceptionType: body.exceptionType,
      amount: Number(body.amount || 0),
      description: body.description,
      reporterId: body.reporterId,
    });
    return jsonOk({ ticket }, { status: 201 });
  } catch (error) {
    return routeError(error, "创建工单失败");
  }
}
