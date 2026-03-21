/**
 * 博客列表：从 API 拉取已发布文章，支持标签筛选
 */
import { apiUrl } from "./api-base.js";
import { applyBrandGreeting, setBrandGreetingContext } from "./site-greeting.js";
import { initBrandMetaBar } from "./brand-meta-bar.js";
import { initSiteNav } from "./nav-shell.js";
import { renderUserAvatarHtml } from "./user-avatar.js";

const brandGreetingEl = document.getElementById("brand-greeting");

initBrandMetaBar();

void initSiteNav("home").then(() => {
  if (brandGreetingEl) applyBrandGreeting(brandGreetingEl);
});

const listEl = document.getElementById("post-list");
const tagChipsEl = document.getElementById("tag-chips");
const tagBarWrap = document.getElementById("tag-bar-wrap");
/** @type {{ id: number; title: string; date: string; tags?: string[]; author?: unknown }[]} */
let published = [];
/** @type {string[]} */
let tagList = [];
/** @type {string | null} */
let activeTag = null;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 作者行：支持 API 返回 { username, displayName } 或旧版字符串 */
function authorBlock(p) {
  const a = p.author;
  if (!a) return "";
  if (typeof a === "string") {
    return `<p class="post-card__author">作者 · ${esc(a)}</p>`;
  }
  if (typeof a === "object" && a.username) {
    const name = esc(a.displayName || a.username);
    const href = `profile.html?u=${encodeURIComponent(a.username)}`;
    const av = renderUserAvatarHtml(a.avatarUrl, {
      classExtra: "user-avatar--xs",
    });
    return `<p class="post-card__author post-card__author--row">${av}<span>作者 · <a href="${href}">${name}</a></span></p>`;
  }
  return "";
}

function renderList() {
  const filtered = activeTag
    ? published.filter((p) => (p.tags || []).includes(activeTag))
    : published;

  if (!filtered.length) {
    listEl.innerHTML =
      '<p class="blog-empty">暂无文章，或没有符合标签的条目。登录后可撰写并勾选「已发布」。</p>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (p) => `
    <li>
      <article class="post-card">
        <a class="post-card__hit" href="/post/${encodeURIComponent(String(p.id))}">
          <time class="post-card__time" datetime="${esc(p.date)}">${esc(p.date)}</time>
          <h2 class="post-card__title">${esc(p.title)}</h2>
        </a>
        ${authorBlock(p)}
        ${
          (p.tags || []).length
            ? `<div class="post-card__tags">${(p.tags || [])
                .map((t) => `<span class="tag">${esc(t)}</span>`)
                .join("")}</div>`
            : ""
        }
      </article>
    </li>`
    )
    .join("");
}

function renderTagChips() {
  if (!tagList.length) {
    tagBarWrap.style.display = "none";
    return;
  }
  tagBarWrap.style.display = "";

  const chips = [{ label: "全部", value: null }, ...tagList.map((t) => ({ label: t, value: t }))];

  tagChipsEl.innerHTML = chips
    .map(({ label, value }) => {
      const isOn = value === null ? activeTag === null : activeTag === value;
      const dataVal = value === null ? "" : encodeURIComponent(value);
      return `<button type="button" class="tag-chip${isOn ? " is-active" : ""}" data-tag="${dataVal}">${esc(label)}</button>`;
    })
    .join("");

  tagChipsEl.querySelectorAll(".tag-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-tag") || "";
      activeTag = raw === "" ? null : decodeURIComponent(raw);
      renderTagChips();
      renderList();
    });
  });
}

async function init() {
  try {
    const res = await fetch(apiUrl("/api/posts"), { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    setBrandGreetingContext({
      ownerDisplayName: data.site?.ownerDisplayName ?? null,
    });
    if (brandGreetingEl) applyBrandGreeting(brandGreetingEl);
    document.title = "文章列表";
    const desc = (data.site?.blogDescription || "").trim().slice(0, 200);
    if (desc) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
      }
      m.setAttribute("content", desc);
    }

    published = [...(data.posts || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    tagList = [...new Set(published.flatMap((p) => p.tags || []))].sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );

    renderTagChips();
    renderList();
  } catch (e) {
    console.error(e);
    listEl.innerHTML =
      '<p class="blog-empty">无法连接 <code>/api/posts</code>。请确认已用 Docker 启动（<code>docker compose up</code>），且 nginx 将 <code>/api</code> 反代到 Node 服务。</p>';
    tagBarWrap.style.display = "none";
  }
}

init();
