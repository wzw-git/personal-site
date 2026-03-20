/**
 * MySQL 连接池与启动时连通性等待
 */
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "blog",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "blog",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

/**
 * 等待数据库就绪（Docker 中 MySQL 启动较慢）
 * @param {number} maxAttempts
 */
async function waitForDb(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (e) {
      console.warn(`[db] 等待 MySQL… (${i + 1}/${maxAttempts})`, e.code || e.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("无法连接 MySQL，请检查 MYSQL_* 环境变量与服务状态");
}

module.exports = { pool, waitForDb };
