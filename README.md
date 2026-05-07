# AI Exam Order Import

基于 `Next.js App Router + TypeScript` 的多模板 Excel 自动导入下单系统。

## 已实现方向

- 多模板 Excel 上传、拖拽上传
- 自动识别 Sheet / 表头行 / 列名别名
- 手动列映射与模板规则学习
- 预览表格在线编辑
- 全量错误校验、批次重复校验、历史重复校验
- 导出当前预览为 Excel
- 提交下单到 PostgreSQL / Neon
- 历史运单列表查询与分页

## 环境变量

支持以下任一数据库连接变量：

- `DATABASE_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`
- `NEON_DATABASE_URL`
- `NEON_POSTGRES_URL`

## 本地启动

```powershell
npm install
npm run dev
```

## 数据库

- 初始化 SQL: [database/schema.sql](./database/schema.sql)
- 服务端首次访问也会自动执行建表逻辑

## 主要接口

- `POST /api/template-rules/match`
- `POST /api/template-rules`
- `POST /api/shipments/check-duplicates`
- `POST /api/import-batches`
- `POST /api/import-batches/:batchId/chunks`
- `GET /api/shipments`

## 当前说明

这是一次从静态演示页向考试题目正式实现的重构，旧的登录/用户列表逻辑已被替换。下一步可继续增强：

- `.xls` 边界兼容测试
- 地址拆列的更强交互式映射
- 更细粒度的提交失败回显
- 更完整的键盘导航体验
