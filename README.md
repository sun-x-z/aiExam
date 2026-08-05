# AI Exam V3 - 运单全流程管理系统

`E:\work\aiExam` 是独立 V3 系统项目。它负责运单异常扫描、物流异常上报、分级审批、品控暂扣、赔付/库存联动、规则配置和 V2 接口监控。

V2 导入和运单主数据服务已拆分到 `E:\work\aiExam-v2`。V3 不内置 V2 导入页面、异步导入 API 或 `/api/v1`、`/api/v2` 适配器，只通过 `V2_API_BASE_URL` 调用独立 V2 HTTP 合同。

## 项目边界

- V3 首页：`/`
- V3 API：`/api/v3/*`
- V3 数据库模型：`lib/server/v3-schema.ts`
- V3 业务流程：`lib/server/v3-workflow.ts`
- V2 联动客户端：`lib/server/v2-client.ts`

不属于本项目：

- 运单文件导入、解析规则、异步导入任务和压测脚本；
- V2 对外 `/api/v1/waybills`、`/api/v2/waybills` 合同实现；
- V2 `shipments`、`import_tasks`、`event_outbox` 等导入表。

这些能力由 `E:\work\aiExam-v2` 提供。

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。

本地联调时先启动 V2：

```powershell
cd E:\work\aiExam-v2
npm run dev
```

V3 默认调用 `http://127.0.0.1:3001/api/v1`。

## 环境变量

至少配置一个 PostgreSQL 连接变量：

- `DATABASE_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`
- `NEON_DATABASE_URL`
- `NEON_POSTGRES_URL`

V2 HTTP 合同：

- `V2_API_BASE_URL=http://127.0.0.1:3001/api/v1`
- `V2_API_KEY=local-dev-v2-key`
- `V2_API_TIMEOUT_MS=3500`
- `V2_API_RETRY_COUNT=1`

## 交互流程

1. V2 导入运单并沉淀主数据。
2. V3 扫描品控或手工上报异常。
3. V3 通过 `V2_API_BASE_URL` 实时校验运单和 SKU。
4. V3 将 V2 返回数据写入 `v3_waybill_snapshots`，并记录 `v3_sync_logs`。
5. V3 根据规则创建物流或品控异常工单。
6. 审批通过后，V3 在同一事务内写入审批、赔付、库存变更、扫描批次解锁等记录。

## 主要 API

- `GET /api/v3/users`
- `GET/POST /api/v3/tickets`
- `GET /api/v3/tickets/:ticketId`
- `POST /api/v3/tickets/:ticketId/approve`
- `POST /api/v3/tickets/:ticketId/quick-release`
- `POST /api/v3/tickets/:ticketId/resubmit`
- `POST /api/v3/scans`
- `GET/PUT /api/v3/rules`
- `GET /api/v3/sync-logs`
- `GET /api/v3/dashboard`
- `POST /api/v3/maintenance`
- `POST /api/v3/seed`

## 验证

```powershell
npm run typecheck
npm run build
```

真实业务流验证需要同时配置 V3 数据库、启动 V2 项目，并确保 `V2_API_BASE_URL` 指向 V2 `/api/v1`。
