/**
 * 写作台 · 文章列表与登录（编辑/新建在 write.html）
 */
import { apiUrl } from "./api-base.js";
import { initBrandMetaBar, syncSiteHeader } from "./brand-meta-bar.js";

const TOKEN_KEY = "blog_admin_token";

let currentRole = "user";

const panelAuth = document.getElementById("panel-auth");
const panelMain = document.getElementById("panel-main");
const loginMsg = document.getElementById("login-msg");
const registerMsg = document.getElementById("register-msg");
const mainMsg = document.getElementById("main-msg");
const adminPostList = document.getElementById("admin-post-list");
const adminPostListPanel = document.querySelector(".admin-post-list-panel");

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLoginWrap = document.getElementById("form-login-wrap");
const formRegisterWrap = document.getElementById("form-register-wrap");

const btnLogin = document.getElementById("btn-login");
const btnRegister = document.getElementById("btn-register");
const btnRefresh = document.getElementById("btn-refresh");

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function postsBase() {
  return currentRole === "admin" ? "/api/admin/posts" : "/api/me/posts";
}

function authHeaders() {
  const t = token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function showLoginMsg(text, ok) {
  loginMsg.innerHTML = text
    ? `<div class="admin-msg ${ok ? "ok" : "err"}">${text}</div>`
    : "";
}

function showRegisterMsg(text, ok) {
  registerMsg.innerHTML = text
    ? `<div class="admin-msg ${ok ? "ok" : "err"}">${text}</div>`
    : "";
}

function showMainMsg(text, ok) {
  mainMsg.innerHTML = text
    ? `<div class="admin-msg ${ok ? "ok" : "err"}">${text}</div>`
    : "";
}

let toastDismissTimer = 0;
let toastHideTimer = 0;

function dismissToast() {
  const el = document.getElementById("admin-toast");
  if (!el) return;
  window.clearTimeout(toastDismissTimer);
  window.clearTimeout(toastHideTimer);
  el.classList.remove("admin-toast--show");
  toastHideTimer = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = "";
  }, 360);
}

function showToast(text, type = "ok", duration = 4200) {
  const el = document.getElementById("admin-toast");
  if (!el) return;
  window.clearTimeout(toastDismissTimer);
  window.clearTimeout(toastHideTimer);
  el.hidden = false;
  el.textContent = text;
  el.className = `admin-toast admin-toast--${type} admin-toast--show`;
  if (duration > 0) {
    toastDismissTimer = window.setTimeout(() => dismissToast(), duration);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...opts.headers,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "响应解析失败" };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authorCell(a) {
  if (!a) return "—";
  if (typeof a === "string") return a;
  return a.displayName || a.username || "—";
}

function statusClassAndLabel(p) {
  if (p.draft) return { cls: "admin-post-item__status--draft", label: "草稿" };
  if (p.published) return { cls: "admin-post-item__status--live", label: "已发布" };
  return { cls: "admin-post-item__status--private", label: "未发布" };
}

function drainAdminFlash() {
  try {
    const raw = sessionStorage.getItem("admin_flash");
    if (!raw) return;
    sessionStorage.removeItem("admin_flash");
    const j = JSON.parse(raw);
    if (j?.msg) showToast(String(j.msg), j.type === "err" ? "err" : "ok", 4800);
  } catch (_) {
    /* 忽略 */
  }
}

function renderPostList(posts) {
  if (!adminPostList) return;
  const showAuthor = currentRole === "admin";
  const list = posts || [];
  if (!list.length) {
    adminPostList.innerHTML = `<li class="admin-post-list__empty">暂无文章。点击右上角「新建文章」开始撰写。</li>`;
    return;
  }

  adminPostList.innerHTML = list
    .map((p) => {
      const { cls: stCls, label: stLabel } = statusClassAndLabel(p);
      const authorHtml = showAuthor
        ? `<span class="admin-post-item__author"><span class="admin-post-item__author-label">作者</span> ${escapeHtml(authorCell(p.author))}</span>`
        : "";
      const wid = encodeURIComponent(String(p.id));
      return `<li class="admin-post-item">
        <div class="admin-post-item__main">
          <h3 class="admin-post-item__title">${escapeHtml(p.title)}</h3>
          <div class="admin-post-item__meta">
            <time class="admin-post-item__date" datetime="${escapeHtml(p.date)}">${escapeHtml(p.date)}</time>
            ${authorHtml}
            <span class="admin-post-item__status ${stCls}">${stLabel}</span>
          </div>
        </div>
        <div class="admin-post-item__actions">
          <a class="admin-post-item__act admin-post-item__act--edit" href="write.html?id=${wid}">
            <svg class="admin-post-item__act-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>编辑</span>
          </a>
          <button type="button" class="admin-post-item__act admin-post-item__act--del" data-act="del" data-id="${escapeHtml(String(p.id))}">
            <svg class="admin-post-item__act-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
            <span>删除</span>
          </button>
        </div>
      </li>`;
    })
    .join("");

  adminPostList.querySelectorAll('button[data-act="del"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (id) await removeOne(id);
    });
  });
}

async function loadList(opts = {}) {
  const { clearMessage = true } = opts;
  if (clearMessage) showMainMsg("");
  try {
    const data = await api(postsBase());
    renderPostList(data.posts);
  } catch (e) {
    if (e.status === 401) {
      logout();
      return;
    }
    showMainMsg(e.message || "加载失败", false);
  }
}

async function removeOne(id) {
  if (!confirm("确定删除该文章？此操作不可恢复。")) return;
  showMainMsg("");
  try {
    await api(`${postsBase()}/${id}`, { method: "DELETE" });
    await loadList({ clearMessage: false });
    showToast("已从列表删除", "ok", 3800);
  } catch (e) {
    showMainMsg(e.message || "删除失败", false);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentRole = "user";
  window.location.href = "index.html";
}

function applyRoleUi() {
  if (!adminPostListPanel) return;
  if (currentRole === "admin") {
    adminPostListPanel.classList.remove("is-user");
  } else {
    adminPostListPanel.classList.add("is-user");
  }
}

async function enterMain() {
  document.documentElement.classList.add("admin-token-present");
  panelAuth.hidden = true;
  panelMain.hidden = false;
  applyRoleUi();
  await loadList();
  drainAdminFlash();
  await syncSiteHeader("write");
}

async function restoreSession() {
  if (!token()) {
    document.documentElement.classList.remove("admin-token-present");
    await syncSiteHeader("write");
    return;
  }
  try {
    const me = await api("/api/auth/me");
    currentRole = me.role || "user";
    await enterMain();
  } catch {
    document.documentElement.classList.remove("admin-token-present");
    logout();
  }
}

function showAuthPanel(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("is-active", isLogin);
  tabRegister.classList.toggle("is-active", !isLogin);
  tabLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
  tabRegister.setAttribute("aria-selected", isLogin ? "false" : "true");
  formLoginWrap.classList.toggle("is-active", isLogin);
  formRegisterWrap.classList.toggle("is-active", !isLogin);
  formLoginWrap.toggleAttribute("hidden", !isLogin);
  formRegisterWrap.toggleAttribute("hidden", isLogin);
  showLoginMsg("");
  showRegisterMsg("");
}

tabLogin.addEventListener("click", () => showAuthPanel("login"));
tabRegister.addEventListener("click", () => showAuthPanel("register"));

btnLogin.addEventListener("click", async () => {
  showLoginMsg("");
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    currentRole = data.role || "user";
    await enterMain();
  } catch (e) {
    showLoginMsg(e.message || "登录失败", false);
  }
});

btnRegister.addEventListener("click", async () => {
  showRegisterMsg("");
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const password2 = document.getElementById("reg-password2").value;
  if (password !== password2) {
    showRegisterMsg("两次密码不一致", false);
    return;
  }
  try {
    const res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showRegisterMsg("注册成功，请切换到「登录」。", true);
  } catch (e) {
    showRegisterMsg(e.message || "注册失败", false);
  }
});

btnRefresh?.addEventListener("click", loadList);

if (window.location.hash === "#login") {
  document.getElementById("panel-auth")?.scrollIntoView({ behavior: "smooth" });
}

initBrandMetaBar();
void restoreSession();
