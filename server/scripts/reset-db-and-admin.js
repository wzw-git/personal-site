#!/usr/bin/env node
/**
 * 清空 blog 库中业务表数据，清空本地上传目录，并插入唯一超级管理员（密码来自 ADMIN_PASSWORD）
 *
 * 本机（需 Node + 能连 MySQL）：
 *   cd server && npm install && npm run reset-db
 *
 * Docker（api 镜像需含 scripts，见 Dockerfile）：
 *   docker compose exec api node scripts/reset-db-and-admin.js
 *
 * 若本机无 Node，可在仓库根目录执行：bash scripts/docker-reset-db.sh
 */
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const rootEnv = path.resolve(__dirname, "../../.env");
const serverEnv = path.resolve(__dirname, "../.env");
if (fs.existsSync(rootEnv)) {
  require("dotenv").config({ path: rootEnv });
} else if (fs.existsSync(serverEnv)) {
  require("dotenv").config({ path: serverEnv });
} else {
  require("dotenv").config();
}

const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "654321";

/** 默认与 docker-compose 挂载一致：仓库根目录 public/uploads */
const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ||
  path.resolve(__dirname, "../../public/uploads");

const TABLES = ["post_tags", "posts", "tags", "users"];

async function countAll(conn) {
  const out = {};
  for (const t of TABLES) {
    const [[r]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    out[t] = r.c;
  }
  return out;
}

function clearUploads() {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    console.warn(`[reset-db] 上传目录不存在，跳过: ${UPLOAD_ROOT}`);
    return 0;
  }
  let n = 0;
  for (const name of fs.readdirSync(UPLOAD_ROOT)) {
    if (name === ".gitkeep") continue;
    const fp = path.join(UPLOAD_ROOT, name);
    if (fs.statSync(fp).isFile()) {
      fs.unlinkSync(fp);
      n += 1;
    }
  }
  return n;
}

async function main() {
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const db = process.env.MYSQL_DATABASE || "blog";
  const user = process.env.MYSQL_USER || "blog";

  const pool = mysql.createPool({
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user,
    password: process.env.MYSQL_PASSWORD || "",
    database: db,
    multipleStatements: true,
  });

  console.warn(
    `[reset-db] 连接 MySQL: host=${host} database=${db} user=${user}`
  );
  console.warn(
    `[reset-db] 即将清空表 ${TABLES.join(", ")}，并创建管理员 ${ADMIN_USER}`
  );

  const conn = await pool.getConnection();
  try {
    const before = await countAll(conn);
    console.warn("[reset-db] 清空前行数:", JSON.stringify(before));

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLES) {
      await conn.query(`TRUNCATE TABLE \`${t}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await conn.query(
      "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, 'admin', ?)",
      [ADMIN_USER, hash, ADMIN_USER]
    );

    const after = await countAll(conn);
    console.warn("[reset-db] 清空后行数:", JSON.stringify(after));
    if (after.users !== 1) {
      console.error("[reset-db] 异常：users 表应为 1 行，请检查是否连错库。");
      process.exitCode = 2;
    }
  } finally {
    conn.release();
    await pool.end();
  }

  const upN = clearUploads();
  console.log(`[reset-db] 已删除上传文件 ${upN} 个（目录 ${UPLOAD_ROOT}）`);
  console.log(
    `[reset-db] 完成。请使用登录名「${ADMIN_USER}」与 .env 中 ADMIN_PASSWORD 登录。`
  );
}

main().catch((e) => {
  console.error("[reset-db] 失败:", e.message);
  process.exit(1);
});
