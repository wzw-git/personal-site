/**
 * 个人博客 API：注册/登录、角色、文章 CRUD、图片上传
 */
require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const { pool, waitForDb } = require("./db");
const { runMigrations } = require("./migrate");
const { resolveClimate } = require("./juhe-weather-store");

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
/** 禁止在生产环境使用的弱 JWT 密钥（与 docker-compose 默认值对齐） */
const WEAK_JWT_SECRETS = new Set([
  "dev-only-change-me",
  "dev_jwt_change_me",
  "dev_change_me",
  "change_me_to_random_long_string",
]);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
if (IS_PRODUCTION) {
  const s = process.env.JWT_SECRET;
  if (!s || WEAK_JWT_SECRETS.has(String(s).trim())) {
    console.error(
      "[security] 生产环境必须在环境变量中设置高强度 JWT_SECRET（勿使用仓库默认值）"
    );
    process.exit(1);
  }
}
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_BOOT_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const BLOG_TITLE = process.env.BLOG_TITLE || "写作笔记";
const BLOG_DESCRIPTION =
  process.env.BLOG_DESCRIPTION || "基于 MySQL 与 Markdown 的个人博客。";
/** 顶栏问候中的显示名，在 .env 设置 SITE_OWNER_NAME */
const SITE_OWNER_NAME = (process.env.SITE_OWNER_NAME || "").trim();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
/** 聚合数据「简单天气」：仅服务端持有 key，前端调 /api/weather */
const JUHE_WEATHER_KEY = (process.env.JUHE_WEATHER_KEY || "").trim();
const JUHE_WEATHER_CITY = (process.env.JUHE_WEATHER_CITY || "深圳").trim();
/** 缓存多久内不向上游发请求（毫秒），默认 8 小时 ≈ 每天每城最多 3 次刷新 */
const WEATHER_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.WEATHER_CACHE_TTL_MS) || 8 * 60 * 60 * 1000
);
/** 聚合免费版等套餐的每日请求上限 */
const JUHE_WEATHER_DAILY_LIMIT = Math.min(
  500,
  Math.max(1, Number(process.env.JUHE_WEATHER_DAILY_LIMIT) || 50)
);

const RESERVED_USERNAMES = new Set([
  "admin",
  "root",
  "administrator",
  "system",
  "api",
  "null",
  "undefined",
]);

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/** CORS：未设置 CORS_ORIGIN 时允许任意源（便于本地开发）；生产建议设为前端源，逗号分隔 */
function buildCorsOptions() {
  const raw = (process.env.CORS_ORIGIN || "").trim();
  if (!raw) {
    if (IS_PRODUCTION) {
      console.warn(
        "[security] 未设置 CORS_ORIGIN，跨域将反射请求 Origin。同域部署可忽略；若 API 单独暴露请限制来源。"
      );
    }
    return { origin: true, credentials: true };
  }
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    origin: list.length === 1 ? list[0] : list,
    credentials: true,
  };
}
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "2mb" }));

/**
 * 展示用 YYYY-MM-DD。避免对 Date 使用 toISOString()（按 UTC 切日，东八区易差一天）。
 * 字符串若以 YYYY-MM-DD 开头则直接取日历位（与 MySQL 会话日期一致）。
 */
function formatDate(d) {
  if (!d) return "";
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d).slice(0, 10);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function slugOk(s) {
  return typeof s === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(s);
}

/** 插入占位 slug（随后在同一事务内改为 p-{id}） */
function tempSlugForInsert() {
  return `tmp-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function stableSlugForPostId(postId) {
  return `p-${postId}`;
}

function usernameOkRegister(s) {
  return (
    typeof s === "string" &&
    /^[a-zA-Z0-9_\u4e00-\u9fff]{2,32}$/.test(s)
  );
}

/** 从文章行构造作者信息（列表/详情接口复用） */
function authorFromPostRow(r) {
  if (!r.author_username) return null;
  const dn = r.author_display_name != null ? String(r.author_display_name).trim() : "";
  const av =
    r.author_avatar_url != null ? String(r.author_avatar_url).trim() : "";
  return {
    username: r.author_username,
    displayName: dn || r.author_username,
    bio: r.author_bio != null ? String(r.author_bio).trim() : "",
    avatarUrl: av || null,
  };
}

/** 删除 uploads 目录下旧头像文件（路径须为 /uploads/ 文件名） */
function tryUnlinkAvatarFile(url) {
  if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) return;
  const base = path.basename(url);
  if (!base || base.includes("..")) return;
  const fp = path.join(UPLOAD_DIR, base);
  try {
    fs.unlinkSync(fp);
  } catch (_) {
    /* 文件不存在或无权删除时忽略 */
  }
}

/** 魔数校验：防止伪造 Content-Type 上传非图片或可执行内容 */
function bufferLooksLikeImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true;
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return true;
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/** multer 落盘后再校验；失败则删除临时文件 */
function validateUploadedImageFile(req, res, next) {
  if (!req.file) return next();
  try {
    const buf = fs.readFileSync(req.file.path);
    if (!bufferLooksLikeImage(buf)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "文件不是有效的 JPEG/PNG/GIF/WebP 图片",
      });
    }
  } catch (_e) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_ignore) {}
    return res.status(400).json({ error: "无法校验上传文件" });
  }
  next();
}

/** 为文章列表批量附加 tags；作者含网名与签名 */
async function attachTags(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [tagRows] = await pool.query(
    `SELECT pt.post_id AS postId, t.name AS name
     FROM post_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.post_id IN (?)`,
    [ids]
  );
  const map = {};
  for (const tr of tagRows) {
    if (!map[tr.postId]) map[tr.postId] = [];
    map[tr.postId].push(tr.name);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: formatDate(r.created_at),
    tags: map[r.id] || [],
    author: authorFromPostRow(r),
  }));
}

async function ensureAdminUser() {
  const [[row]] = await pool.query("SELECT COUNT(*) AS c FROM users");
  if (row.c > 0) return;
  const hash = await bcrypt.hash(ADMIN_BOOT_PASSWORD, 10);
  await pool.query(
    "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, 'admin', ?)",
    [ADMIN_USER, hash, ADMIN_USER]
  );
  console.warn(
    `[auth] 已创建初始管理员：${ADMIN_USER}，请在生产环境修改 ADMIN_PASSWORD`
  );
}

/** JWT 校验并从数据库刷新角色 */
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "需要登录" });
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET, {
      algorithms: ["HS256"],
    });
    const uid = payload.sub;
    const [rows] = await pool.query(
      "SELECT id, username, role FROM users WHERE id = ?",
      [uid]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "用户不存在" });
    }
    req.user = {
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role,
    };
    next();
  } catch (e) {
    console.warn("[auth]", e.message);
    return res.status(401).json({ error: "登录已失效" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 12 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "登录尝试过于频繁，请稍后再试" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: IS_PRODUCTION ? 8 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "注册次数过多，请稍后再试" },
});

/** 上传插图 / 头像（按 IP） */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: IS_PRODUCTION ? 36 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "上传过于频繁，请稍后再试" },
});

/** 文章创建/更新/删除（按 IP，需已通过鉴权） */
const postMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 90 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "操作过于频繁，请稍后再试" },
});

const commentPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PRODUCTION ? 8 : 24,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "发表评论过于频繁，请稍后再试" },
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const use = allowed.includes(ext) ? ext : ".jpg";
      cb(
        null,
        `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${use}`
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error("仅支持 JPEG / PNG / GIF / WebP"), ok);
  },
});

// ---------- 公开接口 ----------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

function sitePayload() {
  return {
    blogTitle: BLOG_TITLE,
    blogDescription: BLOG_DESCRIPTION,
    ownerDisplayName: SITE_OWNER_NAME || null,
  };
}

app.get("/api/site", (req, res) => {
  res.json(sitePayload());
});

const weatherLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 首页实况（天气）：代理 apis.juhe.cn，避免浏览器暴露 key。
 * 主路径 /api/climate（避免 URL 含 weather 被广告拦截扩展误拦）；/api/weather 保留兼容。
 */
async function juheClimateHandler(req, res) {
  if (!JUHE_WEATHER_KEY) {
    return res.status(503).json({
      ok: false,
      error: "未配置天气接口密钥（JUHE_WEATHER_KEY）",
    });
  }
  const rawCity = String(req.query.city || JUHE_WEATHER_CITY).trim();
  const city = rawCity.slice(0, 32).replace(/[^\u4e00-\u9fa5a-zA-Z0-9·\s-]/g, "");
  if (!city) {
    return res.status(400).json({ ok: false, error: "城市名无效" });
  }
  try {
    const result = await resolveClimate({
      uploadDir: UPLOAD_DIR,
      apiKey: JUHE_WEATHER_KEY,
      city,
      ttlMs: WEATHER_CACHE_TTL_MS,
      dailyLimit: JUHE_WEATHER_DAILY_LIMIT,
    });
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
      });
    }
    res.setHeader("X-Climate-Cache", result.hit);
    res.json(result.payload);
  } catch (e) {
    console.error("[weather]", e);
    res.status(502).json({ ok: false, error: "天气服务暂不可用" });
  }
}

app.get("/api/climate", weatherLimiter, juheClimateHandler);
app.get("/api/weather", weatherLimiter, juheClimateHandler);

app.get("/api/posts", async (req, res) => {
  try {
    const tag = (req.query.tag || "").trim();
    let sql = `
      SELECT DISTINCT p.id, p.title, p.created_at,
             u.username AS author_username,
             u.display_name AS author_display_name,
             u.bio AS author_bio,
             u.avatar_url AS author_avatar_url
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      WHERE p.published = 1 AND p.draft = 0`;
    const params = [];
    if (tag) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM post_tags pt
          JOIN tags t ON t.id = pt.tag_id
          WHERE pt.post_id = p.id AND t.name = ?
        )`;
      params.push(tag);
    }
    sql += " ORDER BY p.created_at DESC";
    const [rows] = await pool.query(sql, params);
    const posts = await attachTags(rows);
    res.json({
      site: sitePayload(),
      posts,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取文章列表失败" });
  }
});

/** 已发布文章是否存在（供评论接口使用） */
async function postIsPublicById(postId) {
  const [rows] = await pool.query(
    `SELECT id FROM posts WHERE id = ? AND published = 1 AND draft = 0`,
    [postId]
  );
  return rows.length > 0;
}

/** 公开：某篇已发布文章的评论列表（时间正序） */
app.get("/api/posts/id/:postId/comments", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId) || postId < 1) {
      return res.status(400).json({ error: "id 不合法" });
    }
    if (!(await postIsPublicById(postId))) {
      return res.status(404).json({ error: "文章不存在" });
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.body, c.created_at,
              u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`,
      [postId]
    );
    const comments = rows.map((r) => ({
      id: r.id,
      body: r.body,
      date: formatDate(r.created_at),
      author: authorFromPostRow({
        author_username: r.author_username,
        author_display_name: r.author_display_name,
        author_bio: r.author_bio,
        author_avatar_url: r.author_avatar_url,
      }),
    }));
    res.json({ comments });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取评论失败" });
  }
});

/** 登录用户对已发布文章发表评论 */
app.post(
  "/api/posts/id/:postId/comments",
  authMiddleware,
  commentPostLimiter,
  async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      if (!Number.isInteger(postId) || postId < 1) {
        return res.status(400).json({ error: "id 不合法" });
      }
      if (!(await postIsPublicById(postId))) {
        return res.status(404).json({ error: "文章不存在" });
      }
      const raw = req.body?.body;
      if (typeof raw !== "string") {
        return res.status(400).json({ error: "评论内容无效" });
      }
      const text = raw.trim();
      if (!text) {
        return res.status(400).json({ error: "评论不能为空" });
      }
      if (text.length > 2000) {
        return res.status(400).json({ error: "评论过长（最多 2000 字）" });
      }
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
        return res.status(400).json({ error: "评论含非法字符" });
      }
      const [ins] = await pool.query(
        `INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)`,
        [postId, req.user.id, text]
      );
      res.status(201).json({ id: ins.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "发表评论失败" });
    }
  }
);

/** 删除自己的评论；管理员可删任意评论 */
app.delete("/api/comments/:id", authMiddleware, async (req, res) => {
  try {
    const cid = Number(req.params.id);
    if (!Number.isInteger(cid) || cid < 1) {
      return res.status(400).json({ error: "id 不合法" });
    }
    const [rows] = await pool.query(
      `SELECT c.user_id FROM comments c WHERE c.id = ?`,
      [cid]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "评论不存在" });
    }
    if (
      rows[0].user_id !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "无权删除" });
    }
    const [d] = await pool.query(`DELETE FROM comments WHERE id = ?`, [cid]);
    if (d.affectedRows === 0) {
      return res.status(404).json({ error: "评论不存在" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "删除失败" });
  }
});

/** 按数字 id 读取已发布文章（前台链接用此接口） */
app.get("/api/posts/id/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "id 不合法" });
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.body_md, p.draft, p.published, p.created_at, p.updated_at,
              u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "文章不存在" });
    }
    const p = rows[0];
    if (!p.published || p.draft) {
      return res.status(404).json({ error: "文章不存在" });
    }
    const hydrated = await attachTags([p]);
    const meta = hydrated[0];
    const updatedFmt = formatDate(p.updated_at);
    res.json({
      ...meta,
      body_md: p.body_md,
      draft: false,
      ...(updatedFmt && updatedFmt !== meta.date
        ? { updatedDate: updatedFmt }
        : {}),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取文章失败" });
  }
});

/** 兼容旧书签：按 slug 访问 */
app.get("/api/posts/slug/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slugOk(slug)) {
      return res.status(400).json({ error: "slug 不合法" });
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.body_md, p.draft, p.published, p.created_at, p.updated_at,
              u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.slug = ?`,
      [slug]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "文章不存在" });
    }
    const p = rows[0];
    if (!p.published || p.draft) {
      return res.status(404).json({ error: "文章不存在" });
    }
    const hydrated = await attachTags([p]);
    const meta = hydrated[0];
    const updatedFmt = formatDate(p.updated_at);
    res.json({
      ...meta,
      body_md: p.body_md,
      draft: false,
      ...(updatedFmt && updatedFmt !== meta.date
        ? { updatedDate: updatedFmt }
        : {}),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取文章失败" });
  }
});

// ---------- 注册 / 登录 ----------
app.post("/api/auth/register", registerLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!usernameOkRegister(username)) {
      return res.status(400).json({
        error: "用户名为 2～32 位，仅字母、数字、下划线或中文",
      });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "密码至少 6 位" });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: "密码过长（最多 128 位）" });
    }
    const un = String(username).toLowerCase();
    if (RESERVED_USERNAMES.has(un) || un === String(ADMIN_USER).toLowerCase()) {
      return res.status(400).json({ error: "该用户名不可用" });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, 'user', ?)",
      [username, hash, username]
    );
    res.status(201).json({ ok: true, username });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "用户名已存在" });
    }
    console.error(e);
    res.status(500).json({ error: "注册失败" });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "缺少用户名或密码" });
    }
    const [rows] = await pool.query(
      "SELECT id, username, password_hash, role FROM users WHERE username = ?",
      [username]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }
    const token = jwt.sign({ sub: u.id, u: u.username }, JWT_SECRET, {
      expiresIn: "7d",
      algorithm: "HS256",
    });
    res.json({
      token,
      username: u.username,
      role: u.role,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "登录失败" });
  }
});

/** 当前登录用户资料（含网名、个性签名） */
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      "SELECT username, role, display_name, bio, avatar_url FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!row) {
      return res.status(401).json({ error: "用户不存在" });
    }
    res.json({
      username: row.username,
      role: row.role,
      displayName: row.display_name || row.username,
      bio: row.bio || "",
      avatarUrl: row.avatar_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取资料失败" });
  }
});

/** 更新当前用户登录名、网名、个性签名 */
app.patch("/api/me/profile", authMiddleware, async (req, res) => {
  try {
    const { username, displayName, bio } = req.body || {};
    const updates = [];
    const vals = [];
    if (username !== undefined) {
      const nu = String(username).trim();
      if (!usernameOkRegister(nu)) {
        return res.status(400).json({
          error: "登录名须为 2～32 位，仅字母、数字、下划线或中文",
        });
      }
      const unLower = nu.toLowerCase();
      // 仅当「要改成新登录名」时拦截保留名；本人保持原登录名（如 admin）保存网名/签名时不应报错
      if (nu !== req.user.username) {
        if (
          RESERVED_USERNAMES.has(unLower) ||
          unLower === String(ADMIN_USER).toLowerCase()
        ) {
          return res.status(400).json({ error: "该登录名不可用" });
        }
        const [[dup]] = await pool.query(
          "SELECT id FROM users WHERE username = ? AND id <> ?",
          [nu, req.user.id]
        );
        if (dup) {
          return res.status(409).json({ error: "该登录名已被使用" });
        }
        updates.push("username = ?");
        vals.push(nu);
      }
    }
    if (displayName !== undefined) {
      const d = String(displayName).trim();
      if (!d || d.length > 32) {
        return res.status(400).json({ error: "网名须为 1～32 个字符" });
      }
      updates.push("display_name = ?");
      vals.push(d);
    }
    if (bio !== undefined) {
      const b = String(bio);
      if (b.length > 512) {
        return res.status(400).json({ error: "个性签名过长（最多 512 字）" });
      }
      updates.push("bio = ?");
      vals.push(b.trim());
    }
    if (updates.length) {
      vals.push(req.user.id);
      await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        vals
      );
    }
    const [[row]] = await pool.query(
      "SELECT username, role, display_name, bio, avatar_url FROM users WHERE id = ?",
      [req.user.id]
    );
    res.json({
      username: row.username,
      role: row.role,
      displayName: row.display_name || row.username,
      bio: row.bio || "",
      avatarUrl: row.avatar_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "保存失败" });
  }
});

/** 公开用户资料（按登录用户名查询） */
app.get("/api/users/:username/profile", async (req, res) => {
  try {
    const username = String(
      decodeURIComponent(req.params.username || "")
    ).trim();
    if (!username || username.length > 64) {
      return res.status(400).json({ error: "参数不合法" });
    }
    const [rows] = await pool.query(
      "SELECT username, display_name, bio, avatar_url FROM users WHERE username = ?",
      [username]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "用户不存在" });
    }
    const u = rows[0];
    res.json({
      username: u.username,
      displayName: u.display_name || u.username,
      bio: u.bio || "",
      avatarUrl: u.avatar_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取失败" });
  }
});

// ---------- 图片上传（登录用户）----------
app.post(
  "/api/upload",
  authMiddleware,
  uploadLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "上传失败" });
      next();
    });
  },
  validateUploadedImageFile,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "请选择图片文件（字段名 file）" });
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  }
);

/** 上传或更换头像（字段名 file，规则同正文插图） */
app.post(
  "/api/me/avatar",
  authMiddleware,
  uploadLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "上传失败" });
      next();
    });
  },
  validateUploadedImageFile,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "请选择图片文件（字段名 file）" });
      }
      const url = `/uploads/${req.file.filename}`;
      const [[row]] = await pool.query(
        "SELECT avatar_url FROM users WHERE id = ?",
        [req.user.id]
      );
      if (row?.avatar_url) tryUnlinkAvatarFile(row.avatar_url);
      await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [
        url,
        req.user.id,
      ]);
      res.json({ avatarUrl: url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "保存头像失败" });
    }
  }
);

/** 移除头像，恢复默认展示 */
app.delete("/api/me/avatar", authMiddleware, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      "SELECT avatar_url FROM users WHERE id = ?",
      [req.user.id]
    );
    if (row?.avatar_url) tryUnlinkAvatarFile(row.avatar_url);
    await pool.query("UPDATE users SET avatar_url = NULL WHERE id = ?", [
      req.user.id,
    ]);
    res.json({ ok: true, avatarUrl: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "清除头像失败" });
  }
});

async function replacePostTags(conn, postId, tagNames) {
  await conn.query("DELETE FROM post_tags WHERE post_id = ?", [postId]);
  const names = [
    ...new Set(
      (tagNames || []).map((t) => String(t).trim()).filter(Boolean)
    ),
  ];
  for (const name of names) {
    await conn.query("INSERT IGNORE INTO tags (name) VALUES (?)", [name]);
    const [[t]] = await conn.query("SELECT id FROM tags WHERE name = ?", [
      name,
    ]);
    await conn.query(
      "INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)",
      [postId, t.id]
    );
  }
}

const POST_TITLE_MAX = 500;
const POST_BODY_MD_MAX = 900_000;
const POST_TAGS_MAX = 24;
const POST_TAG_LEN_MAX = 64;

function validatePostTagsInput(tags) {
  if (tags == null) return { ok: true, tags: [] };
  if (!Array.isArray(tags)) {
    return { error: "标签格式无效" };
  }
  if (tags.length > POST_TAGS_MAX * 2) {
    return { error: "标签数量过多" };
  }
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    const s = String(raw).trim();
    if (!s) continue;
    if (s.length > POST_TAG_LEN_MAX) {
      return { error: `单个标签最多 ${POST_TAG_LEN_MAX} 个字符` };
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) {
      return { error: "标签含非法控制字符" };
    }
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length > POST_TAGS_MAX) {
      return { error: `最多 ${POST_TAGS_MAX} 个标签` };
    }
  }
  return { ok: true, tags: out };
}

function postPayloadFromBody(body) {
  const { title, body_md, published, draft, tags } = body || {};
  const t = typeof title === "string" ? title.trim() : "";
  if (!t) {
    return { error: "标题与正文必填" };
  }
  if (t.length > POST_TITLE_MAX) {
    return { error: `标题过长（最多 ${POST_TITLE_MAX} 字）` };
  }
  if (typeof body_md !== "string") {
    return { error: "标题与正文必填" };
  }
  if (body_md.length > POST_BODY_MD_MAX) {
    return { error: "正文过长，请精简或拆分文章" };
  }
  let pub = published ? 1 : 0;
  let dr = draft ? 1 : 0;
  if (pub && dr) {
    pub = 0;
    dr = 1;
  }
  const vt = validatePostTagsInput(tags);
  if (vt.error) return { error: vt.error };
  return {
    title: t,
    body_md,
    published: pub,
    draft: dr,
    tags: vt.tags,
  };
}

// ---------- 普通用户：自己的文章 ----------
app.get("/api/me/posts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.body_md, p.published, p.draft,
              p.created_at, p.updated_at, u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.author_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const withTags = await attachTags(rows);
    const full = rows.map((r, i) => ({
      id: r.id,
      title: r.title,
      body_md: r.body_md,
      published: !!r.published,
      draft: !!r.draft,
      date: formatDate(r.created_at),
      updated_at: formatDate(r.updated_at),
      tags: withTags[i]?.tags || [],
      author: withTags[i]?.author || null,
    }));
    res.json({ posts: full });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取失败" });
  }
});

app.get("/api/me/posts/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT p.*, u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.id = ? AND p.author_id = ?`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "不存在" });
    const [hydrated] = await attachTags(rows);
    const p = rows[0];
    res.json({
      id: p.id,
      title: p.title,
      body_md: p.body_md,
      published: !!p.published,
      draft: !!p.draft,
      date: formatDate(p.created_at),
      tags: hydrated.tags || [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取失败" });
  }
});

app.post("/api/me/posts", authMiddleware, postMutationLimiter, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const parsed = postPayloadFromBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO posts (author_id, slug, title, excerpt, body_md, published, draft)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [
        req.user.id,
        tempSlugForInsert(),
        parsed.title,
        parsed.body_md,
        parsed.published,
        parsed.draft,
      ]
    );
    const postId = r.insertId;
    const stable = stableSlugForPostId(postId);
    await conn.query("UPDATE posts SET slug = ? WHERE id = ?", [stable, postId]);
    await replacePostTags(conn, postId, parsed.tags);
    await conn.commit();
    res.status(201).json({ id: postId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: "创建失败" });
  } finally {
    conn.release();
  }
});

app.put("/api/me/posts/:id", authMiddleware, postMutationLimiter, async (req, res) => {
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    const parsed = postPayloadFromBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    await conn.beginTransaction();
    const [u] = await conn.query(
      `UPDATE posts SET title=?, excerpt=NULL, body_md=?, published=?, draft=?
       WHERE id=? AND author_id=?`,
      [
        parsed.title,
        parsed.body_md,
        parsed.published,
        parsed.draft,
        id,
        req.user.id,
      ]
    );
    if (u.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "不存在或无权修改" });
    }
    await replacePostTags(conn, id, parsed.tags);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: "更新失败" });
  } finally {
    conn.release();
  }
});

app.delete("/api/me/posts/:id", authMiddleware, postMutationLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [d] = await pool.query(
      "DELETE FROM posts WHERE id = ? AND author_id = ?",
      [id, req.user.id]
    );
    if (d.affectedRows === 0) {
      return res.status(404).json({ error: "不存在或无权删除" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "删除失败" });
  }
});

// ---------- 管理员：全部文章 ----------
app.get("/api/admin/posts", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.body_md, p.published, p.draft,
              p.created_at, p.updated_at, u.username AS author_username,
              u.display_name AS author_display_name,
              u.bio AS author_bio,
              u.avatar_url AS author_avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       ORDER BY p.created_at DESC`
    );
    const withTags = await attachTags(rows);
    const full = rows.map((r, i) => ({
      id: r.id,
      title: r.title,
      body_md: r.body_md,
      published: !!r.published,
      draft: !!r.draft,
      date: formatDate(r.created_at),
      updated_at: formatDate(r.updated_at),
      tags: withTags[i]?.tags || [],
      author: withTags[i]?.author || null,
    }));
    res.json({ posts: full });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "读取失败" });
  }
});

app.get(
  "/api/admin/posts/:id",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT p.*, u.username AS author_username,
                u.display_name AS author_display_name,
                u.bio AS author_bio,
                u.avatar_url AS author_avatar_url
         FROM posts p
         LEFT JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "不存在" });
      const [hydrated] = await attachTags(rows);
      const p = rows[0];
      res.json({
        id: p.id,
        title: p.title,
        body_md: p.body_md,
        published: !!p.published,
        draft: !!p.draft,
        date: formatDate(p.created_at),
        tags: hydrated.tags || [],
        author: hydrated.author,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "读取失败" });
    }
  }
);

app.post(
  "/api/admin/posts",
  authMiddleware,
  requireAdmin,
  postMutationLimiter,
  async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const parsed = postPayloadFromBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO posts (author_id, slug, title, excerpt, body_md, published, draft)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [
        req.user.id,
        tempSlugForInsert(),
        parsed.title,
        parsed.body_md,
        parsed.published,
        parsed.draft,
      ]
    );
    const postId = r.insertId;
    const stable = stableSlugForPostId(postId);
    await conn.query("UPDATE posts SET slug = ? WHERE id = ?", [stable, postId]);
    await replacePostTags(conn, postId, parsed.tags);
    await conn.commit();
    res.status(201).json({ id: postId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: "创建失败" });
  } finally {
    conn.release();
  }
});

app.put(
  "/api/admin/posts/:id",
  authMiddleware,
  requireAdmin,
  postMutationLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    const conn = await pool.getConnection();
    try {
      const parsed = postPayloadFromBody(req.body);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
      }
      await conn.beginTransaction();
      const [u] = await conn.query(
        `UPDATE posts SET title=?, excerpt=NULL, body_md=?, published=?, draft=?
         WHERE id=?`,
        [
          parsed.title,
          parsed.body_md,
          parsed.published,
          parsed.draft,
          id,
        ]
      );
      if (u.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ error: "不存在" });
      }
      await replacePostTags(conn, id, parsed.tags);
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ error: "更新失败" });
    } finally {
      conn.release();
    }
  }
);

app.delete(
  "/api/admin/posts/:id",
  authMiddleware,
  requireAdmin,
  postMutationLimiter,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [d] = await pool.query("DELETE FROM posts WHERE id = ?", [id]);
      if (d.affectedRows === 0) {
        return res.status(404).json({ error: "不存在" });
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "删除失败" });
    }
  }
);

// ---------- 启动 ----------
async function main() {
  await waitForDb();
  await runMigrations(pool, ADMIN_USER);
  await ensureAdminUser();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[blog-api] 监听 http://0.0.0.0:${PORT}，上传目录 ${UPLOAD_DIR}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
