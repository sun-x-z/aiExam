import type { Metadata } from "next";
import { V3Workspace } from "@/components/v3-workspace";

export const metadata: Metadata = {
  title: "AI Exam V3 - 运单全流程管理",
  description: "运单异常扫描、工单审批、规则配置和接口监控。",
};

export default function Page() {
  return <V3Workspace />;
}
