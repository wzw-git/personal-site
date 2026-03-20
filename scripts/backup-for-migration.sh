#!/usr/bin/env bash
# 迁移前一键备份：MySQL(blog) 逻辑导出 + public/uploads 打包
# 用法：在仓库根目录执行 ./scripts/backup-for-migration.sh [输出目录]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f docker-compose.yml ]]; then
  echo "请在包含 docker-compose.yml 的仓库根目录执行" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-${ROOT}/migration-backup-${STAMP}}"
mkdir -p "$OUT"

# 从 .env 读取密码（值中勿含未转义换行；标准 KEY=value 即可）
load_env() {
  local key="$1"
  if [[ -f .env ]]; then
    grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true
  fi
}

MYSQL_ROOT_PASSWORD="$(load_env MYSQL_ROOT_PASSWORD)"
MYSQL_PASSWORD="$(load_env MYSQL_PASSWORD)"

if ! docker compose exec -T mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
  echo "MySQL 不可用，请先执行: docker compose up -d mysql 并等待 healthy" >&2
  exit 1
fi

echo ">>> 导出数据库 blog -> ${OUT}/blog.sql"
if [[ -n "${MYSQL_ROOT_PASSWORD}" ]]; then
  docker compose exec -T mysql mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" \
    --single-transaction --routines --databases blog >"${OUT}/blog.sql"
elif [[ -n "${MYSQL_PASSWORD}" ]]; then
  docker compose exec -T mysql mysqldump -u blog -p"${MYSQL_PASSWORD}" \
    --single-transaction --routines --databases blog >"${OUT}/blog.sql"
else
  echo "无法从 .env 读取 MYSQL_ROOT_PASSWORD 或 MYSQL_PASSWORD" >&2
  exit 1
fi

echo ">>> 打包 public/uploads -> ${OUT}/uploads.tgz"
if [[ -d public/uploads ]]; then
  tar czf "${OUT}/uploads.tgz" -C public uploads
else
  echo "警告: 无 public/uploads 目录，跳过" >&2
fi

cp .env.example "${OUT}/env.example.reference.txt"

echo ""
echo "备份完成: ${OUT}"
echo "请自行将 .env 复制到安全位置（勿提交 Git），例如:"
echo "  cp .env ${OUT}/env.backup && chmod 600 ${OUT}/env.backup"
echo "传输到新服务器后，按 docs/MIGRATION.md 恢复。"
