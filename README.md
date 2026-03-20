# personal-site · 个人博客全栈

基于 **Docker Compose** 的一体化部署方案：**MySQL 8** 持久化数据，**Node.js + Express** 提供 REST API，**Nginx** 托管前端静态资源并反向代理 `/api`。支持 Markdown 写作、标签、用户资料、图片上传与可选天气接口。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| 访客 | 文章列表与筛选、文章详情、公开用户资料页 |
| 作者 | 注册/登录、Markdown 编辑器、发布/草稿、插图上传、IT 向标签预设 |
| 管理员 | 管理全部文章（与普通用户共用写作台，权限由角色区分） |
| 安全 | JWT（HS256）、接口限流、上传魔数校验、Helmet / Nginx 安全头（详见 `SECURITY.md`） |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS（ES Modules）、Marked、DOMPurify、Google Fonts |
| API | Node.js 18+、Express、mysql2、jsonwebtoken、bcryptjs、multer、helmet、cors、express-rate-limit |
| 数据 | MySQL 8.0 |
| 部署 | Docker、Docker Compose、Nginx Alpine |

**说明**：项目已整体容器化（三服务编排），无需在宿主机单独安装 Node/MySQL 即可运行；本地开发 API 时也可仅用 `server/` + 本机 MySQL。

---

## 架构（概念）

```
浏览器 → Nginx:80（静态 public/ + 反代 /api/）→ API:3000 → MySQL:3306
                                              ↘（可选）聚合数据天气 HTTPS
```

更细的流程图与表格见站内 **[博客说明.html](public/博客说明.html)**（需通过 HTTP 访问该页，含 Mermaid 图）。

---

## 快速开始（Docker Compose）

### 前置条件

- 已安装 [Docker](https://docs.docker.com/get-docker/) 与 [Docker Compose](https://docs.docker.com/compose/)（Docker Desktop 已内置 Compose V2）

### 步骤

```bash
git clone https://github.com/wzw-git/personal-site.git
cd personal-site
cp .env.example .env
# 编辑 .env：至少修改 MYSQL_*、JWT_SECRET、ADMIN_PASSWORD（切勿使用示例默认值上线）

docker compose up -d --build
```

浏览器访问：`http://服务器IP:HTTP_PORT`（默认 **8090**，在 `.env` 里由 `HTTP_PORT` 控制）。

- 文章首页：`/index.html`
- 后台与登录：`/admin.html`
- 写作：`/write.html`
- 部署与安全长文：`/博客说明.html`

默认管理员账号见 `.env` 中 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（**首次空库**时由 API 引导创建；已有数据后不会自动改密）。

### 常用命令

```bash
docker compose ps
docker compose logs -f api
docker compose up -d --build api   # 仅重建 API 镜像（改代码后）
docker compose down              # 停止容器（默认保留 MySQL 数据卷）
```

**说明**：`server/Dockerfile` 内已设置 `NODE_ENV=production`，因此 API 容器会启用生产级校验（含**弱 `JWT_SECRET` 拒绝启动**）。部署前必须在 `.env` 中设置足够随机的 `JWT_SECRET`。

---

## 环境变量

根目录 **`.env.example`** 含全部变量说明。核心项：

| 变量 | 作用 |
|------|------|
| `HTTP_PORT` | 宿主机映射到 Nginx 的端口 |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | 数据库密码 |
| `JWT_SECRET` | JWT 签名密钥（须足够随机；镜像内 `NODE_ENV=production` 时会拒绝弱密钥） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 初始管理员 |
| `CORS_ORIGIN` | 可选，限制跨域来源（逗号分隔） |
| `JUHE_WEATHER_*` | 可选，首页天气 |

**勿将真实 `.env` 提交到 Git**（已在 `.gitignore` 中忽略）。

---

## 仓库结构（摘要）

```
personal-site/
├── docker-compose.yml    # MySQL + API + Nginx
├── nginx/default.conf    # 静态站点与 /api 反代
├── public/               # 前端与 uploads/（用户上传）
├── server/               # API 源码与 Dockerfile
├── docs/MIGRATION.md     # 换服务器迁移指南
├── SECURITY.md           # 安全说明
├── 部署说明.txt          # 纯文本速查
└── scripts/              # 辅助脚本（如 backup-for-migration.sh）
```

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/MIGRATION.md](docs/MIGRATION.md) | **换云服务器迁移**（备份、传输、恢复、HTTPS、排错） |
| [SECURITY.md](SECURITY.md) | 已实施的安全措施与上线检查 |
| [public/博客说明.html](public/博客说明.html) | 站内详细说明与 Mermaid 流程图 |
| [部署说明.txt](部署说明.txt) | 终端友好的短版部署说明 |

---

## 本地开发 API（可选）

```bash
cd server
cp .env.example .env   # 配置 MYSQL_HOST 等
npm install
npm start
```

前端通过 `public/js/api-base.js` 指向本地 API 地址即可联调（注意浏览器 CORS）。

---

## 作者

维护者：**[@wzw-git](https://github.com/wzw-git)**

---

## 许可

若未另行声明，默认保留所有权利；可按需在仓库中补充 `LICENSE` 文件。
