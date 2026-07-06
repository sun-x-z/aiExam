import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Exam V3 - 运单全流程管理",
  description: "扫描品控、异常上报、分级审批、赔付库存联动与 V2 HTTP 接口同步。",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
