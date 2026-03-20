# 云服务器迁移指南

本文说明如何将 **personal-site** 从一台已运行的服务器迁移到**新的云主机**，并继续使用 **Docker Compose** 部署。按顺序操作可减少停机时间与数据丢失风险。

---

## 1. 迁移前你需要理解的内容

### 1.1 项目已是「全 Docker」编排

**「整个项目用 Docker 跑」在本仓库里 = 使用根目录 `docker compose up` 一次拉起全部服务**，而不是打一个巨型单镜像：MySQL、Node API、Nginx 分容器是常见最佳实践（数据卷、升级、排错更清晰）。若你希望「一条命令上线」，在项目根目录执行：

```bash
docker compose up -d --build
```

即可。

当前仓库**不需要**在宿主机单独安装 Node 或 MySQL。标准运行方式为：

| 服务（Compose 名） | 镜像/构建 | 数据持久化 |
|---------------------|-----------|------------|
| `mysql` | `mysql:8.0` | 命名数据卷 `mysql_blog_data`（Docker 管理，在宿主机某目录） |
| `api` | `./server` Dockerfile | 无状态；上传文件在挂载目录 |
| `nginx` | `nginx:alpine` | 只读挂载 `./public` 与 `./nginx/default.conf` |

**必须带走的数据：**

1. **MySQL 中的业务数据**（用户、文章、标签等）— 用 **逻辑备份（mysqldump）** 最稳妥。  
2. **`public/uploads/`** 下的用户上传图片（头像、正文插图）。  
3. **`.env`**（或等价环境变量），含数据库密码、`JWT_SECRET`、天气 Key 等。

**代码**：可从 Git 重新 `clone`，或用 `rsync` 拷贝整个仓库目录（二选一即可）。

### 1.2 建议的迁移策略

- **低停机**：旧机保持运行 → 做一次**最终备份** → 短暂停机切换 DNS 或反代 → 新机 `compose up` 并导入数据。  
- **可接受停机**：直接停旧机 compose → 备份 → 新机恢复。

---

## 2. 旧服务器（迁出端）操作

### 2.1 确认项目路径与 Compose 项目名

```bash
cd ~/personal-site   # 或你的实际路径
docker compose ps
```

数据卷名通常为 **`<项目目录名>_mysql_blog_data`**，例如目录名为 `personal-site` 时卷名为 `personal-site_mysql_blog_data`。可用下面命令查看：

```bash
docker volume ls | grep mysql
```

### 2.2 备份 MySQL（推荐：mysqldump）

在**项目根目录**（与 `docker-compose.yml` 同级）执行。

**方式 A：使用仓库提供的脚本（推荐）**

```bash
chmod +x scripts/backup-for-migration.sh
./scripts/backup-for-migration.sh
```

会在当前目录生成 `migration-backup-日期时间/`（或你指定的目录），内含 `blog.sql` 与 `uploads.tgz`。

**方式 B：手动**

```bash
# 将 .env 中的 MYSQL_PASSWORD 导出到当前 shell（注意：仅在可信环境操作）
set -a && source .env && set +a

mkdir -p ~/blog-migration-backup
docker compose exec -T mysql mysqldump -u blog -p"$MYSQL_PASSWORD" \
  --single-transaction --routines --databases blog \
  > ~/blog-migration-backup/blog.sql
```

若 `blog` 用户权限不足，可用 root（密码为 `.env` 中 `MYSQL_ROOT_PASSWORD`）：

```bash
docker compose exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
  --databases blog > ~/blog-migration-backup/blog.sql
```

### 2.3 备份上传目录

```bash
tar czvf ~/blog-migration-backup/uploads.tgz -C public uploads
```

### 2.4 备份配置（切勿上传至公开仓库）

```bash
cp .env ~/blog-migration-backup/env.backup
# 或安全复制到本机：scp ubuntu@旧IP:~/blog-migration-backup/env.backup .
```

### 2.5 打包整个项目（可选）

便于离线传输（仍建议敏感信息单独保管）：

```bash
cd ~
tar czvf personal-site-code.tgz personal-site \
  --exclude='personal-site/public/uploads/*' \
  --exclude='personal-site/.git' \
  --exclude='personal-site/**/node_modules'
```

上传文件仍用前面的 `uploads.tgz` + `blog.sql` 更干净。

### 2.6 传输到新机器

示例（从新机器上拉取）：

```bash
# 在新服务器上
mkdir -p ~/migrate && cd ~/migrate
scp -r olduser@旧公网IP:~/blog-migration-backup ./
```

或使用对象存储、网盘等中间介质（**加密传输/加密存储**）。

---

## 3. 新服务器（迁入端）要求

### 3.1 系统与软件

- 常见 Linux（Ubuntu 22.04/24.04、Debian、AlmaLinux 等）  
- 已安装 **Docker Engine** 与 **Docker Compose V2**  
- 开放防火墙端口：**`HTTP_PORT`**（默认 8090），若前面还有 CDN/反代则只开放 80/443 亦可  

安装 Docker（Ubuntu 示例，以官方文档为准）：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
# 按 https://docs.docker.com/engine/install/ubuntu/ 添加官方源后：
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
# 重新登录后 docker 命令免 sudo
```

### 3.2 获取代码

```bash
cd ~
git clone https://github.com/wzw-git/personal-site.git
cd personal-site
```

若使用私有部署包，则 `scp`/`rsync` 解压到 `~/personal-site`。

---

## 4. 新服务器恢复数据

### 4.1 放置 `.env`

```bash
cd ~/personal-site
cp /path/to/env.backup .env
chmod 600 .env
```

**重要**：新环境若 **MySQL 密码与旧机一致**，可少改变量；若修改了 `MYSQL_PASSWORD`，导入后需与库内无关（dump 不含用户密码变更逻辑），但 **Compose 里 API 连接串必须与新库一致**。

**JWT_SECRET**：建议与旧站**保持一致**，否则所有用户需重新登录。

### 4.2 首次启动 MySQL（空卷）并导入 SQL

先**仅启动 MySQL**，待 healthy 后导入：

```bash
docker compose up -d mysql
docker compose ps   # 等待 mysql healthy
```

将备份 SQL 导入（密码来自 `.env`）：

```bash
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" < ~/migrate/blog-migration-backup/blog.sql
```

若 dump 已包含 `CREATE DATABASE blog`，上述即可；若报错，可先建库：

```bash
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS blog;"
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" blog < ~/migrate/blog-migration-backup/blog.sql
```

### 4.3 恢复上传文件

```bash
cd ~/personal-site
tar xzvf ~/migrate/blog-migration-backup/uploads.tgz -C public
# 确保存在 public/uploads/.gitkeep 且图片权限可读
```

### 4.4 启动完整栈

```bash
docker compose up -d --build
docker compose ps
curl -sS http://127.0.0.1:8090/api/health
```

将 `8090` 换成你的 `HTTP_PORT`。

---

## 5. 域名、HTTPS 与防火墙

### 5.1 DNS

将域名 **A 记录** 指向新服务器公网 IP；TTL 可提前调低以便切换。

### 5.2 防火墙（UFW 示例）

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8090/tcp    # 或直接 80/443
sudo ufw enable
```

若使用 **Nginx/Caddy 宿主机反代** 到 `127.0.0.1:8090`，则对外只开放 80/443。

### 5.3 HTTPS（简要）

- **方案 A**：在宿主机安装 **Caddy** 或 **Certbot + Nginx**，申请 Let’s Encrypt，反代到 `http://127.0.0.1:8090`。  
- **方案 B**：使用云厂商 **负载均衡 / CDN** 托管证书，回源到服务器端口。

生产环境务必上 HTTPS，并在 TLS 层配置 **HSTS**（参见 `SECURITY.md`）。

---

## 6. 迁移后验证清单

- [ ] `docker compose ps` 三个服务均为 `running`，`mysql`、`api` 健康检查通过  
- [ ] 浏览器打开首页，文章列表与标签正常  
- [ ] 随机打开一篇文章，图片能显示（`uploads` 已恢复）  
- [ ] 使用旧账号登录，写作/保存正常  
- [ ] `/api/health` 返回 `{"ok":true}`  
- [ ] （若配置）首页天气正常  

---

## 7. 不要做的事（常见坑）

1. **不要把 MySQL 数据卷目录直接 tar 拷到另一台机再挂载** — 跨内核/存储驱动容易出权限或 InnoDB 损坏问题；优先 **mysqldump**。  
2. **不要把 `.env` 提交到 Git** 或发到公开频道。  
3. **不要在未改默认密码的情况下把 8090 暴露到公网**。  
4. 修改 `JWT_SECRET` 会导致**全员 token 失效**，需知情再改。

---

## 8. 回滚

若新机有问题，可暂时把 **DNS 指回旧 IP**，旧机 `docker compose up -d` 保持运行直至新机修完。

---

## 9. 故障排查

| 现象 | 排查 |
|------|------|
| API 反复重启 | `docker compose logs api`，常见为连不上 MySQL 或 `JWT_SECRET` 过弱被拒绝 |
| 502 | Nginx 反代不到 API，确认 `api` healthy、`depends_on` 正常 |
| 文章无图 | 检查 `public/uploads` 是否解压到正确路径、Nginx `root` 是否指向 `public` |
| 登录后立刻 401 | 新机 `JWT_SECRET` 与签发时不一致，或浏览器仍带旧域名的缓存 |

更细的接口与安全说明见根目录 **`SECURITY.md`** 与 **`public/博客说明.html`**。

---

## 10. 相关文件

| 文件 | 用途 |
|------|------|
| `scripts/backup-for-migration.sh` | 一键 mysqldump + 打包 `public/uploads` |
| `docker-compose.yml` | 服务定义与卷名 |
| `README.md` | 项目总览与快速开始 |

---

*文档版本与仓库功能同步；若你增加了新服务或卷，请相应更新备份与恢复步骤。*
