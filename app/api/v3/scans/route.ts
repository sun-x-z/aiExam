import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { scanWaybill } from "@/lib/server/v3-workflow";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      waybillNo?: string;
      skuCode?: string;
      batchNo?: string;
      operatorId?: string;
      deviceCode?: string;
      description?: string;
      quantityDeltaPercent?: number;
      damageLevel?: number;
      specDeviationMm?: number;
      labelMatched?: boolean;
      batchAgeDays?: number;
    }>(request);
    if (!body.waybillNo || !body.skuCode || !body.operatorId) {
      return jsonError("waybillNo、skuCode、operatorId 均必填", 400);
    }
    const result = await scanWaybill({
      waybillNo: body.waybillNo,
      skuCode: body.skuCode,
      batchNo: body.batchNo || "",
      operatorId: body.operatorId,
      deviceCode: body.deviceCode,
      description: body.description,
      quantityDeltaPercent: body.quantityDeltaPercent,
      damageLevel: body.damageLevel,
      specDeviationMm: body.specDeviationMm,
      labelMatched: body.labelMatched,
      batchAgeDays: body.batchAgeDays,
    });
    return jsonOk(result, { status: result.judgement === "abnormal" ? 201 : 200 });
  } catch (error) {
    return routeError(error, "扫描失败");
  }
}
