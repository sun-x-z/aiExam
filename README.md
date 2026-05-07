# AI Exam User List

登录后展示用户信息列表，数据来自 Vercel API + Neon PostgreSQL。

## 配置

需要在 Vercel 环境变量中设置：

- `DATABASE_URL`
- `AUTH_SECRET`

如果是 Vercel/Neon 集成，也可以直接使用：

- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL`

## 初始化数据库

首次访问登录接口时会自动创建 `public.user_profiles` 表并写入 `admin/admin123` 等初始用户。

## 本地验证

```powershell
npm install
npm test
```

## 实施阻碍

- 当前仓库原本只有静态前端，没有后端工程结构，需要补 `api/*`。
- 需要先在 Neon 创建数据库并配置 `DATABASE_URL`，否则登录和列表接口不可用。
- 现有页面依赖本地假数据，已迁移为数据库查询，旧的本地头像持久化逻辑已移除。
