# AI Exam V2 - 运单导入与异步处理系统

基于 `Next.js App Router + TypeScript + PostgreSQL/Neon` 的 V2 运单导入系统。原有 V2 规则驱动导入能力已保留，并合并了异步任务、Outbox、批量校验、批量写入、行级错误、进度追踪、监控看板和 Trace 检索。

`aiExam-v2` 是需求中的 V3 参考项目；本仓库 `aiExam` 是需求中的 V2 目标项目。本次合并只迁移 V3 项目中已经提交的 V2 导入能力，不迁移 V3 审批、品控、赔付和库存领域。

## 已实现能力

- 文件上传、解析规则管理、试解析、预览编辑和历史运单查询。
- 上传即返回 `task_id`，任务创建、处理单元和 Outbox 事件在同一数据库事务中完成。
- Dispatcher/Worker 异步处理，按批次执行批量 SKU 校验和批量 UPSERT。
- 行级错误、批次性能日志、任务进度、Trace 时间线和监控聚合。
- SKU 主数据压测脚本、10,000 行 Excel 生成脚本和导入压测脚本。
- `/api/v1`、`/api/v2` 运单查询接口，供原 V3 项目通过 HTTP 合同联调。

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:3000` 进入异步导入工作台。

## 环境变量

支持以下数据库连接变量之一：

- `DATABASE_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`
- `NEON_DATABASE_URL`
- `NEON_POSTGRES_URL`

V2 对外 HTTP 合同配置：

- `V2_API_BASE_URL`：外部调用方使用的 V2 API 地址；本仓库内置 `/api/v1` 和 `/api/v2` 路由。
- `V2_API_KEY=local-dev-v2-key`
- `V2_API_TIMEOUT_MS=3500`、`V2_API_RETRY_COUNT=1`：仅当其他服务通过 HTTP 调用 V2 时使用。

异步导入配置：

- `IMPORT_BATCH_SIZE=1000`
- `IMPORT_WORKER_BATCH_LIMIT=2`
- `IMPORT_FORCE_SKU_DEGRADED=1`：模拟 SKU 主数据校验降级。

## 文档

- [V2 异步导入实现说明](./docs/V2_ASYNC_IMPORT_IMPLEMENTATION.md)
- [V2 系统间接口文档](./docs/V2_INTERFACE_CONTRACT.md)

## 主要 API

- `POST /api/import-tasks`
- `GET /api/import-tasks/:taskId`
- `GET /api/import-tasks/:taskId/errors`
- `GET /api/import-tasks/:taskId/batches`
- `POST /api/import-dispatcher/tick`
- `POST /api/import-worker/tick`
- `GET /api/import-monitor/summary`
- `GET /api/traces/:traceId`

## 数据库

服务端首次访问会自动执行建表逻辑，数据库访问仍使用原有 `pg Pool`、单连接池和事务封装：

- 兼容表定义位于 [lib/server/v3-schema.ts](./lib/server/v3-schema.ts)。
- V2 导入表定义位于 [lib/server/import-schema.ts](./lib/server/import-schema.ts)。
- 手工初始化脚本分别位于 [database/schema.sql](./database/schema.sql) 和 [database/import-schema.sql](./database/import-schema.sql)。
- V2 导入任务创建使用 `withClient`，任务、行数据、批次和 Outbox 同事务提交。

## 压测与流程验证

```powershell
npm run seed:perf
npm run loadtest:import
```

`seed:perf` 默认生成 20,000 条 `sku_master` 主数据和 `test-data/10000-orders.xlsx`；重复执行只清理 `SKU_%` 记录后重新灌入。`loadtest:import` 上传压测文件，主动触发 Dispatcher/Worker tick，轮询任务直到结束，并输出上传耗时、总耗时、成功/失败行数和 60 秒目标是否达成。

Vercel 部署时，应通过 Cron 或独立 Worker 定时调用 `/api/import-worker/tick`，不能依赖用户页面长连接。
