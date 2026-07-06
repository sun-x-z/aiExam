# AI Exam V3 - 运单全流程管理系统

基于 `Next.js App Router + TypeScript + PostgreSQL/Neon` 的 V3 运单全生命周期管理系统，覆盖扫描品控、异常上报、分级审批、执行联动、接口监控和需求假设说明。

## 已实现能力

- V3 独立数据模型：工单、审批、赔付、库存、扫描、规则、接口日志、运单快照。
- V2 HTTP 对接：创建工单和扫描时实时校验运单/SKU，不直接连接 V2 数据库。
- 扫描品控：可配置规则命中、批次暂扣、重复扫描幂等、品控主管快速放行。
- 异常上报：物流异常手工上报，阻止同运单同类型未关闭工单重复创建。
- 分级审批：一级/二级审批、金额阈值可配置、并发版本校验、自批自审拦截。
- 执行联动：赔付方向区分客户理赔/供应商追偿，库存变更可追溯到审批记录。
- 维护任务：审批超时升级/驳回，禁用审批人自动转交。
- 200+ 样本数据生成：用于验证列表筛选、分页、统计。

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。

本地联调需要同时启动拆分出的 V2 项目：

```powershell
cd E:\work\aiExam-v2
npm install
npm run dev
```

V2 默认运行在 `http://127.0.0.1:3001`，对 V3 暴露 `http://127.0.0.1:3001/api/v1`。

## 环境变量

支持以下数据库连接变量之一：

- `DATABASE_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`
- `NEON_DATABASE_URL`
- `NEON_POSTGRES_URL`

V2 接口配置：

- `V2_API_BASE_URL=http://127.0.0.1:3001/api/v1`：生产环境填写真实 V2 API 地址。
- `V2_LOCAL_PORT=3001`：未配置 `V2_API_BASE_URL` 时使用的本地 V2 端口。
- `V2_API_KEY=local-dev-v2-key`
- `V2_API_TIMEOUT_MS=3500`
- `V2_API_RETRY_COUNT=1`

V3 不再内置 `/api/v2` 适配器；运单导入、解析规则和 V2 HTTP 服务已拆分到 `E:\work\aiExam-v2`。

## 文档

- [V3 设计文档](./docs/V3_DESIGN.md)
- [需求理解与假设说明](./docs/REQUIREMENT_ASSUMPTIONS.md)
- [V2 系统间接口文档](./docs/V2_INTERFACE_CONTRACT.md)

## 主要 API

- `GET/POST /api/v3/tickets`
- `GET /api/v3/tickets/:ticketId`
- `POST /api/v3/tickets/:ticketId/approve`
- `POST /api/v3/tickets/:ticketId/quick-release`
- `POST /api/v3/tickets/:ticketId/resubmit`
- `POST /api/v3/scans`
- `GET/PUT /api/v3/rules`
- `GET /api/v3/sync-logs`
- `POST /api/v3/maintenance`
- `POST /api/v3/seed`

## 数据库

服务端首次访问会自动执行建表逻辑：

- V3 新表定义位于 [lib/server/v3-schema.ts](./lib/server/v3-schema.ts)。
- 静态 SQL 初始脚本在 [database/schema.sql](./database/schema.sql)，V3 以代码内 schema 为准自动 bootstrap。
