import { jsonError, jsonOk } from "@/lib/server/http";
import { readJson, routeError } from "@/lib/server/v3-http";
import { listApprovalRules, listQualityRules, updateApprovalRule, updateQualityRule } from "@/lib/server/v3-workflow";
import type { QualityRule } from "@/lib/v3/types";

export async function GET() {
  try {
    const [approvalRules, qualityRules] = await Promise.all([listApprovalRules(), listQualityRules()]);
    return jsonOk({ approvalRules, qualityRules });
  } catch (error) {
    return routeError(error, "加载规则失败");
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<{
      kind?: "approval" | "quality";
      id?: string;
      minAmount?: number;
      maxAmount?: number | null;
      targetLevel?: number;
      level1TimeoutHours?: number;
      level2TimeoutHours?: number;
      severity?: "low" | "medium" | "high";
      condition?: QualityRule["condition"];
      enabled?: boolean;
      priority?: number;
    }>(request);
    if (!body.kind || !body.id) return jsonError("kind、id 均必填", 400);
    if (body.kind === "approval") {
      const rule = await updateApprovalRule({
        id: body.id,
        minAmount: Number(body.minAmount ?? 0),
        maxAmount: body.maxAmount === undefined ? null : body.maxAmount,
        targetLevel: Number(body.targetLevel ?? 1),
        level1TimeoutHours: Number(body.level1TimeoutHours ?? 24),
        level2TimeoutHours: Number(body.level2TimeoutHours ?? 48),
        enabled: Boolean(body.enabled),
      });
      return jsonOk({ rule });
    }
    if (!body.condition || !body.severity) return jsonError("condition、severity 均必填", 400);
    const rule = await updateQualityRule({
      id: body.id,
      severity: body.severity,
      targetApprovalLevel: Number(body.targetLevel ?? 2),
      condition: body.condition,
      enabled: Boolean(body.enabled),
      priority: Number(body.priority ?? 100),
    });
    return jsonOk({ rule });
  } catch (error) {
    return routeError(error, "保存规则失败");
  }
}
