# V2 异步导入实现说明

本文件是仓库内的实现摘要；完整的开发设计文档位于 `E:\ai\exam4\aiExam-v2-async-import-design.md`。

## 版本映射

- `E:\work\aiExam`：需求文档中的 V2 目标系统。
- `E:\work\aiExam-v2`：需求文档中的 V3 参考系统。
- 本次迁移只把 V3 项目中已经提交的 V2 导入能力并入本仓库，V3 审批、品控、赔付、库存领域不属于本次主链路。

## 保留与清理原则

- 原有规则驱动解析、规则 CRUD、AI 规则草稿、预览编辑、历史查询和分块提交接口继续保留。
- 异步任务主链路使用 `import-tasks.ts`；旧 `import-batches` 接口仅作为兼容 API，不与异步主链路混用。
- `v2-client.ts` 负责外部 V3 调用 V2 的 HTTP 客户端；`local-v2-adapter.ts` 负责本项目内置 `/api/v1`、`/api/v2` 的服务端适配，两者职责不同。
- 原仓库中的 V3 页面和 API 暂时保留用于兼容验证，不参与 V2 异步导入验收。

## 当前实现

- `POST /api/import-tasks`：接收已按规则解析的行数据，在单事务中创建任务、行数据、批次和 Outbox。
- `/api/import-dispatcher/tick`：扫描 `event_outbox`，将待处理批次置为 `queued`。
- `/api/import-worker/tick`：恢复超时批次、抢占队列批次、批量 SKU 校验、批量 UPSERT、写错误和性能日志。
- `/api/import-tasks/:taskId`、`errors`、`batches`：任务进度、行级错误和批次查询。
- `/api/import-monitor/summary`、`/api/traces/:traceId`：吞吐、队列、阶段耗时、错误分布和时间线查询。

## 验证命令

```powershell
npm run typecheck -- --incremental false
npm run build
npm run seed:perf
npm run loadtest:import
```

真实压测需要先配置 PostgreSQL 连接串，并确保 `sku_master` 已生成 20,000 条主数据。
