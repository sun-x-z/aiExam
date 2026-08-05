import type { Metadata } from "next";
import { ImportWorkspace } from "@/components/import-workspace";

export const metadata: Metadata = {
  title: "AI Exam V2 - 运单导入与异步处理",
  description: "规则驱动的运单导入、异步批量处理、任务追踪与全链路可观测性。",
};

export default function ImportPage() {
  return <ImportWorkspace />;
}
