#!/usr/bin/env node
/**
 * 将已有用户（默认 admin）的密码更新为 .env 中的 ADMIN_PASSWORD
 * 不改变其它表数据。解决：只改了 .env 但库里仍是旧密码哈希的问题。
 *
 *   cd server && npm run set-admin-password
 *
 * Docker:
 *   docker compose exec api node scripts/set-admin-password.js
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

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "blog",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "blog",
  });

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [r] = await pool.query(
    "UPDATE users SET password_hash = ? WHERE username = ?",
    [hash, ADMIN_USER]
  );

  await pool.end();

  if (r.affectedRows === 0) {
    console.error(
      `[set-admin-password] 未找到用户「${ADMIN_USER}」。请先注册该用户，或执行 npm run reset-db 初始化空库。`
    );
    process.exit(1);
  }
  console.log(
    `[set-admin-password] 已更新「${ADMIN_USER}」密码为当前 .env 中的 ADMIN_PASSWORD（长度 ${ADMIN_PASSWORD.length}）。`
  );
}

main().catch((e) => {
  console.error("[set-admin-password]", e.message);
  process.exit(1);
});
