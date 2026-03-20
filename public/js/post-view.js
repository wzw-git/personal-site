/**
 * 文章页：从 API 取正文；Markdown 优先 vendor/CDN，失败则用同文件内内置解析（不依赖 .mjs 二次请求）
 */
import { apiUrl } from "./api-base.js";
import { applyBrandGreeting, setBrandGreetingContext } from "./site-greeting.js";
import { initSiteNav } from "./nav-shell.js";
import { renderUserAvatarHtml } from "./user-avatar.js";

const params = new URLSearchParams(window.location.search);
const postIdRaw = (params.get("id") || "").trim();
const legacySlug = (params.get("slug") || "").trim();

const elTitle = document.getElementById("post-title");
const elDate = document.getElementById("post-date");
const elTags = document.getElementById("post-tags");
const elAuthor = document.getElementById("post-author");
const elBody = document.getElementById("post-body");
const elError = document.getElementById("post-error");
const elArticle = document.getElementById("post-article");
const brandGreetingEl = document.getElementById("brand-greeting");
void initSiteNav("post").then(() => {
  if (brandGreetingEl) applyBrandGreeting(brandGreetingEl);
});

function showError(msg) {
  if (elArticle) elArticle.hidden = true;
  if (elError) {
    elError.hidden = false;
    elError.textContent = msg;
  }
  document.title = "文章未找到 · 博客";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickMarked(mod) {
  const m = mod?.marked ?? mod?.default ?? mod;
  if (m && typeof m.parse === "function") return m;
  throw new Error("marked 模块无效：缺少 parse");
}
function pickPurify(mod) {
  const p = mod?.default ?? mod;
  if (p && typeof p.sanitize === "function") return p;
  throw new Error("DOMPurify 模块无效：缺少 sanitize");
}

/** UMD 脚本注入的全局（见 post.html），不依赖 import / MIME */
function tryGlobalMarkdownLibs() {
  const w = globalThis;
  const mk = w.marked;
  const pur = w.DOMPurify;
  if (mk && typeof mk.parse === "function" && pur && typeof pur.sanitize === "function") {
    return { marked: mk, DOMPurify: pur };
  }
  return null;
}

function applyMarkedOptions(marked) {
  if (!marked) return;
  if (typeof marked.setOptions === "function") {
    marked.setOptions({ gfm: true, breaks: false });
  } else if (typeof marked.use === "function") {
    try {
      marked.use({ gfm: true, breaks: false });
    } catch (_) {
      /* 部分版本 use 仅接受扩展对象 */
    }
  }
}

/* ========== 内置 Markdown 子集（原 markdown-fallback，内联） ========== */
function fbProcBoldLink(s) {
  const links = [];
  let t = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, text, url) => {
    links.push({ t: esc(text), u: esc(url) });
    return `\x01L${links.length - 1}\x01`;
  });
  t = t.replace(/\*\*([\s\S]*?)\*\*/g, (_, x) => "<strong>" + esc(x) + "</strong>");
  t = t.replace(/\*([^*\x01]+?)\*/g, (_, x) => "<em>" + esc(x) + "</em>");
  t = t
    .split(/(\x01L\d+\x01|<\/?(?:strong|em)\b[^>]*>)/gi)
    .map((part) => {
      if (/^\x01L\d+\x01$/.test(part) || /^<\/?(strong|em)/i.test(part)) {
        return part;
      }
      return esc(part);
    })
    .join("");
  for (let i = 0; i < links.length; i++) {
    t = t.replace(`\x01L${i}\x01`, `<a href="${links[i].u}">${links[i].t}</a>`);
  }
  return t;
}

function fbSimpleInline(raw) {
  const codes = [];
  const t = raw.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\x01C${codes.length - 1}\x01`;
  });
  let out = fbProcBoldLink(t);
  for (let i = 0; i < codes.length; i++) {
    out = out.replace(`\x01C${i}\x01`, "<code>" + esc(codes[i]) + "</code>");
  }
  return out;
}

function fbRenderMarkdown(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let para = [];

  function flushPara() {
    if (para.length) {
      const text = para.join("\n").trim();
      if (text) blocks.push("<p>" + fbSimpleInline(text) + "</p>");
      para = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    if (trim.startsWith("```")) {
      flushPara();
      i++;
      const chunk = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        chunk.push(lines[i]);
        i++;
      }
      blocks.push("<pre><code>" + esc(chunk.join("\n")) + "</code></pre>");
      if (i < lines.length) i++;
      continue;
    }

    // CommonMark：行首可有最多 3 个空格；# 与标题之间可有零个空格
    const hm = line.match(/^\s{0,3}(#{1,6})\s*(.+)$/);
    if (hm) {
      flushPara();
      const title = hm[2].trim();
      if (!title) {
        para.push(line);
        i++;
        continue;
      }
      const lv = hm[1].length;
      blocks.push(`<h${lv}>` + fbSimpleInline(title) + `</h${lv}>`);
      i++;
      continue;
    }

    // 无序列表：`-` / `*` 后可有零个空格（如「-项」）
    if (/^\s*[-*]\s*/.test(line) && line.replace(/^\s*[-*]\s*/, "").length > 0) {
      flushPara();
      const items = [];
      while (
        i < lines.length &&
        /^\s*[-*]\s*/.test(lines[i]) &&
        lines[i].replace(/^\s*[-*]\s*/, "").trim().length > 0
      ) {
        items.push(lines[i].replace(/^\s*[-*]\s*/, ""));
        i++;
      }
      blocks.push(
        "<ul>" +
          items.map((it) => "<li>" + fbSimpleInline(it) + "</li>").join("") +
          "</ul>"
      );
      continue;
    }

    if (/^\s{0,3}\d+\.\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s{0,3}\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        "<ol>" +
          items.map((it) => "<li>" + fbSimpleInline(it) + "</li>").join("") +
          "</ol>"
      );
      continue;
    }

    if (trim === "---" || trim === "***" || trim === "___") {
      flushPara();
      blocks.push("<hr />");
      i++;
      continue;
    }

    if (trim === "") {
      flushPara();
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushPara();
      const qs = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qs.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        "<blockquote>" +
          qs.map((q) => "<p>" + fbSimpleInline(q) + "</p>").join("") +
          "</blockquote>"
      );
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return blocks.join("\n");
}

const FB_ALLOW = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "CODE", "PRE", "A", "STRONG",
  "EM", "BLOCKQUOTE", "HR", "BR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
  "IMG",
]);

function fbSanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(
    `<div id="r">${html}</div>`,
    "text/html"
  );
  const root = doc.getElementById("r");
  if (!root) return "";

  function walk(node) {
    const children = Array.from(node.childNodes);
    for (const ch of children) {
      if (ch.nodeType === Node.TEXT_NODE) continue;
      if (ch.nodeType !== Node.ELEMENT_NODE) {
        ch.remove();
        continue;
      }
      const el = /** @type {Element} */ (ch);
      const tag = el.tagName.toUpperCase();
      if (!FB_ALLOW.has(tag)) {
        while (el.firstChild) node.insertBefore(el.firstChild, el);
        el.remove();
        continue;
      }
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase();
        if (tag === "A" && n === "href") {
          const v = attr.value.trim();
          if (!/^https?:\/\//i.test(v)) el.removeAttribute("href");
        } else if (tag === "IMG" && n === "src") {
          const v = attr.value.trim();
          if (!/^https?:\/\//i.test(v)) el.removeAttribute("src");
        } else if (tag === "IMG" && (n === "alt" || n === "title" || n === "loading")) {
          if (n === "loading" && !/^(lazy|eager)$/i.test(attr.value)) {
            el.removeAttribute(attr.name);
          }
          /* alt / title 保留纯文本属性 */
        } else {
          el.removeAttribute(attr.name);
        }
      }
      walk(el);
    }
  }
  walk(root);
  return root.innerHTML;
}

const builtinMarked = {
  use() {},
  parse(src) {
    return fbRenderMarkdown(src);
  },
};
const builtinPurify = {
  sanitize(h) {
    return fbSanitizeHtml(h);
  },
};

/** 全局 UMD → vendor ESM → CDN → 同文件内置 */
async function loadMarkdownLibs() {
  const g = tryGlobalMarkdownLibs();
  if (g) return g;

  const candidates = [
    async () => {
      const [m, p] = await Promise.all([
        import("./vendor/marked.min.mjs"),
        import("./vendor/purify.min.mjs"),
      ]);
      return { marked: pickMarked(m), DOMPurify: pickPurify(p) };
    },
    async () => {
      // 注意：marked@12.1.0 在 esm.sh 上曾 404，用 @12 走稳定解析路径
      const [m, p] = await Promise.all([
        import("https://esm.sh/marked@12"),
        import("https://esm.sh/dompurify@3.1.6"),
      ]);
      return { marked: pickMarked(m), DOMPurify: pickPurify(p) };
    },
    async () => ({
      marked: builtinMarked,
      DOMPurify: builtinPurify,
    }),
  ];
  let lastErr;
  for (const load of candidates) {
    try {
      return await load();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("无法加载 Markdown 库");
}

async function init() {
  if (!elTitle || !elArticle || !elError || !elBody) {
    console.error("post-view: DOM 不完整");
    return;
  }

  let fetchUrl = "";
  if (postIdRaw) {
    const pid = Number(postIdRaw);
    if (!Number.isInteger(pid) || pid < 1) {
      showError("文章 id 不合法。");
      return;
    }
    fetchUrl = apiUrl(`/api/posts/id/${pid}`);
  } else if (legacySlug && /^[a-z0-9][a-z0-9-]*$/i.test(legacySlug)) {
    fetchUrl = apiUrl(`/api/posts/slug/${encodeURIComponent(legacySlug)}`);
  } else {
    showError("缺少参数：请从文章列表进入，或使用旧版 ?slug= 链接。");
    return;
  }

  let marked;
  let DOMPurify;
  try {
    const libs = await loadMarkdownLibs();
    marked = libs.marked;
    DOMPurify = libs.DOMPurify;
    applyMarkedOptions(marked);
  } catch (e) {
    console.error(e);
    showError("Markdown 引擎初始化失败（不应出现）。请强制刷新缓存（Ctrl+Shift+R）。");
    return;
  }

  let blogLabel = "博客";
  let meta;
  try {
    const res = await fetch(fetchUrl, {
      cache: "no-cache",
    });
    if (res.status === 404) {
      showError("文章不存在或未发布。");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    meta = await res.json();
    const sres = await fetch(apiUrl("/api/site"), { cache: "no-cache" });
    if (sres.ok) {
      const s = await sres.json();
      if (s.blogTitle) blogLabel = s.blogTitle;
      setBrandGreetingContext({
        ownerDisplayName: s.ownerDisplayName ?? null,
      });
      if (brandGreetingEl) applyBrandGreeting(brandGreetingEl);
    }
  } catch (e) {
    console.error(e);
    showError("无法加载文章，请确认 API 与数据库服务已启动。");
    return;
  }

  try {
    elTitle.textContent = meta.title;
    elDate.dateTime = meta.date;
    elDate.textContent = meta.updatedDate
      ? `${meta.date} · 更新 ${meta.updatedDate}`
      : meta.date;
    if (elAuthor) {
      const a = meta.author;
      if (a && typeof a === "object" && a.username) {
        elAuthor.hidden = false;
        elAuthor.classList.add("post-author--row");
        const name = esc(a.displayName || a.username);
        const href = `profile.html?u=${encodeURIComponent(a.username)}`;
        const av = renderUserAvatarHtml(a.avatarUrl, {
          classExtra: "user-avatar--xs",
        });
        elAuthor.innerHTML = `${av}<span>作者 · <a href="${href}">${name}</a></span>`;
      } else if (typeof a === "string" && a) {
        elAuthor.hidden = false;
        elAuthor.classList.remove("post-author--row");
        elAuthor.textContent = `作者 · ${a}`;
      } else {
        elAuthor.hidden = true;
        elAuthor.classList.remove("post-author--row");
        elAuthor.textContent = "";
      }
    }
    elTags.innerHTML = (meta.tags || [])
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join("");

    // marked 部分版本/扩展可能返回 Promise，统一 await
    const rawHtml = await Promise.resolve(marked.parse(meta.body_md || ""));
    elBody.innerHTML = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ["target"],
    });

    elBody.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });

    document.title = `${meta.title} · ${blogLabel}`;
    const desc = meta.title || "";
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "description");
      document.head.appendChild(m);
    }
    m.setAttribute("content", desc);
  } catch (e) {
    console.error(e);
    showError("渲染正文时出错，请刷新重试。");
  }
}

init().catch((e) => {
  console.error(e);
  showError("页面初始化失败，请刷新或检查控制台。");
});
