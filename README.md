# Simple User System

一个可直接部署到 Vercel 的简易静态系统，支持：

- 用户登录
- 登录后展示对应用户资料
- 用户头像修改
- 浏览器本地持久化头像和登录态

## 演示账号

| 用户名 | 密码 |
| --- | --- |
| `admin` | `Admin123!` |
| `alice` | `Alice123!` |
| `bob` | `Bob123!` |

## 本地运行

项目没有构建依赖，直接启动静态服务器即可。

```powershell
cd C:\Users\sunlixin\Desktop\simple-user-system
python -m http.server 4173
```

然后访问：

```text
http://127.0.0.1:4173
```

## GitHub 提交

```powershell
git init
git add .
git commit -m "feat: add simple user system"
git branch -M main
git remote add origin git@github.com:sunlixin1024/simple-user-system.git
git push -u origin main
```

如果仓库还不存在，需要先在 GitHub 创建 `simple-user-system` 仓库，或者安装 `gh` 后通过 CLI 创建。

## Vercel 部署

```powershell
vercel login
vercel --prod
```

这是静态站点，Vercel 会直接识别根目录内容并完成部署。
