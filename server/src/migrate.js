/**
 * 启动时增量迁移（兼容已有数据卷，不破坏旧库）
 */

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} adminUsername 环境变量中的管理员用户名，用于补全 role
 */
async function runMigrations(pool, adminUsername) {
  async function addColumnIgnoreDup(sql) {
    try {
      await pool.query(sql);
    } catch (e) {
      if (e.errno !== 1060) throw e; // ER_DUP_FIELDNAME
    }
  }

  await addColumnIgnoreDup(
    `ALTER TABLE users ADD COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user'`
  );

  await pool.query(`UPDATE users SET role = 'admin' WHERE username = ?`, [
    adminUsername,
  ]);

  await addColumnIgnoreDup(
    `ALTER TABLE posts ADD COLUMN author_id INT UNSIGNED NULL`
  );

  const [[first]] = await pool.query(
    `SELECT id FROM users ORDER BY id ASC LIMIT 1`
  );
  if (first) {
    await pool.query(
      `UPDATE posts SET author_id = ? WHERE author_id IS NULL`,
      [first.id]
    );
  }

  try {
    await pool.query(
      `ALTER TABLE posts ADD CONSTRAINT fk_posts_author
       FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL`
    );
  } catch (e) {
    if (e.errno !== 1826 && e.errno !== 1215 && e.errno !== 1005) throw e;
    // 外键已存在或类型不兼容时忽略
  }

  await addColumnIgnoreDup(
    `ALTER TABLE users ADD COLUMN display_name VARCHAR(64) NULL`
  );
  await addColumnIgnoreDup(`ALTER TABLE users ADD COLUMN bio VARCHAR(512) NULL`);
  await pool.query(
    `UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''`
  );

  await addColumnIgnoreDup(
    `ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL`
  );
}

module.exports = { runMigrations };
