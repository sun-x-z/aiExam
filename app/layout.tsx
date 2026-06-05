import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Exam 2.0 - 智能多格式批量下单",
  description: "规则引擎 + AI 辅助生成的 Excel / Word / PDF 多格式出库单导入系统。",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
