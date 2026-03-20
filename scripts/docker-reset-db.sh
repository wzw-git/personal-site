#!/usr/bin/env bash
# 在仓库根目录执行：清空 blog 库四张业务表并重启 API，启动时自动按 .env 创建唯一 admin
# 用法：bash scripts/docker-reset-db.sh
# 需已 docker compose up，且 .env 中 MYSQL_PASSWORD、ADMIN_USERNAME、ADMIN_PASSWORD 正确

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "未找到 $ROOT/.env"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

MP="${MYSQL_PASSWORD:-blogpass_change_me}"
DB="${MYSQL_DATABASE:-blog}"
MU="${MYSQL_USER:-blog}"

echo ">>> 将清空库 ${DB} 中 post_tags / posts / tags / users（连接 mysql 容器）"
docker compose exec -T mysql mysql -u"$MU" -p"$MP" "$DB" -e "
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE post_tags;
TRUNCATE TABLE posts;
TRUNCATE TABLE tags;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;
"

echo ">>> 清空本地上传目录 public/uploads（保留 .gitkeep）"
find "$ROOT/public/uploads" -maxdepth 1 -type f ! -name '.gitkeep' -delete 2>/dev/null || true

echo ">>> 重启 api，将按 .env 创建管理员 ${ADMIN_USERNAME:-admin}"
docker compose restart api

echo ">>> 完成。请稍等数秒待 API 就绪后，用 ${ADMIN_USERNAME:-admin} 与 ADMIN_PASSWORD 登录。"
