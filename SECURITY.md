# 安全说明

个人博客栈：Nginx 静态页 + Node/Express API + MySQL。以下为威胁模型下的注意点与已做措施。

## 已实施的服务端加固

| 类别 | 说明 |
|------|------|
| **JWT** | 签发/校验固定为 `HS256`；生产环境（`NODE_ENV=production`）若未设置或使用已知弱 `JWT_SECRET` 则进程退出。 |
| **CORS** | 可通过 `CORS_ORIGIN` 设为逗号分隔的允许源；未设置时在开发/同域场景下仍反射 `Origin`（生产同域可接受，API 单独暴露时务必限制）。 |
| **限流** | 登录/注册/上传/文章写操作均有 `express-rate-limit`；**发表评论**单独限流；生产环境阈值更严。 |
| **上传** | Multer 限制类型与大小；落盘后按文件头魔数校验 JPEG/PNG/GIF/WebP，与 MIME 不一致则删除并拒绝。 |
| **文章载荷** | 标题/正文长度上限；标签数量与单标签长度限制；禁止控制字符；`published`+`draft` 同时真时规范为草稿。 |
| **评论** | 仅登录用户可发；正文非空、长度上限、禁止控制字符；删除仅限作者本人或管理员。 |
| **密码** | 注册密码长度上限 128，减轻 bcrypt 滥用成本。 |
| **HTTP 头** | Helmet（禁用 CSP JSON 接口不适用）；`Referrer-Policy`、`CORP` 等；Nginx 增加 `X-Frame-Options`、`X-Content-Type-Options`、`Permissions-Policy` 等。 |
| **SQL** | 查询均使用参数化，未发现字符串拼接用户输入进 SQL。 |
| **天气代理** | 上游 URL 固定为聚合数据域名，城市参数白名单式清洗，无开放 SSRF。 |

## 部署前必做

1. **`.env` / Compose**：设置高强度 `JWT_SECRET`、`MYSQL_*`、`ADMIN_PASSWORD`；不要使用仓库或 compose 默认值上线。
2. **生产进程**：为 API 容器/进程设置 `NODE_ENV=production`，以启用弱密钥检测与更严限流。
3. **HTTPS**：对外服务应终止 TLS（CDN / Nginx / Caddy），并配置 `Strict-Transport-Security`。
4. **反向代理**：保持 `trust proxy` 与 Nginx 的 `X-Forwarded-*` 一致，以便限流使用真实客户端 IP。
5. **上传目录**：`public/uploads` 仅通过 Web 服务器以静态文件暴露；已禁止访问 `.` 开头文件（含天气状态缓存）。

## 残余风险与建议

- **XSS（Markdown）**：正文由前端 `DOMPurify` 净化后渲染；作者即信任边界，恶意 Markdown 仍需谨慎插件配置。
- **Token 存储**：当前为 `localStorage` Bearer；若站点存在 XSS，令牌可被盗。高威胁场景可改为 `HttpOnly` Cookie + CSRF 防护（改动较大）。
- **CSP**：未对 HTML 配置严格 `Content-Security-Policy`（需按是否使用内联脚本/字体 CDN 细调）；可在 Nginx 对 `*.html` 单独加 CSP。
- **依赖漏洞**：定期执行 `npm audit` 与镜像/基础镜像更新。
- **备份与审计**：数据库定期备份；生产可接访问日志与异常告警。

## 报告问题

若发现漏洞，请通过私密渠道联系维护者，勿公开可复现的利用细节直至修复完成。
