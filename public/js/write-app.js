/**
 * 写作台 · 新建/编辑文章（列表在 admin.html）
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

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLoginWrap = document.getElementById("form-login-wrap");
const formRegisterWrap = document.getElementById("form-register-wrap");

const btnLogin = document.getElementById("btn-login");
const btnRegister = document.getElementById("btn-register");
const btnSave = document.getElementById("btn-save");
const btnDiscardEdit = document.getElementById("btn-discard-edit");
const btnClearDraft = document.getElementById("btn-clear-draft");
const writeBackList = document.getElementById("write-back-list");
const inputImage = document.getElementById("f-image");
const mdPreviewEl = document.getElementById("md-preview");
const mdPanesEl = document.getElementById("md-panes");
const elId = document.getElementById("edit-id");
const fTitle = document.getElementById("f-title");
const fTags = document.getElementById("f-tags");
const fBody = document.getElementById("f-body");
const fVisibilityLive = document.getElementById("f-visibility-live");
const fVisibilityDraft = document.getElementById("f-visibility-draft");

/** 与接口一致：已发布 = published 且非草稿；草稿 = draft=1 且不对访客展示 */
function getPublishedDraftForSave() {
  if (fVisibilityLive?.checked) return { published: true, draft: false };
  return { published: false, draft: true };
}

function setPostVisibilityFromServer(published, draft) {
  const live = Boolean(published) && !draft;
  if (fVisibilityLive) fVisibilityLive.checked = live;
  if (fVisibilityDraft) fVisibilityDraft.checked = !live;
}

const leaveDialog = document.getElementById("leave-confirm-dialog");
const leaveStayBtn = document.getElementById("leave-confirm-stay");
const leaveGoBtn = document.getElementById("leave-confirm-leave");

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

/** 未保存检测：null 表示尚未完成首屏加载，不拦截离开 */
let savedFormSnapshot = null;

function getFormSnapshot() {
  const { published, draft } = getPublishedDraftForSave();
  return JSON.stringify({
    id: elId.value.trim(),
    title: fTitle.value,
    body: fBody.value,
    pub: published,
    draft,
    tags: [...selectedTags].sort().join("\u0001"),
  });
}

function markDraftClean() {
  savedFormSnapshot = getFormSnapshot();
}

function isDraftDirty() {
  if (savedFormSnapshot === null) return false;
  return getFormSnapshot() !== savedFormSnapshot;
}

/** 关闭离开确认弹窗并解析 Promise（true = 仍要离开） */
let leaveDialogResolve = /** @type {((v: boolean) => void) | null} */ (null);

function finishLeaveDialog(value) {
  if (leaveDialog) leaveDialog.hidden = true;
  const r = leaveDialogResolve;
  leaveDialogResolve = null;
  if (r) r(value);
}

/** 有未保存内容时弹出站点风格对话框；无 DOM 时回退原生 confirm */
function confirmLeaveIfDirtyAsync() {
  if (!isDraftDirty()) return Promise.resolve(true);
  if (!leaveDialog || !leaveStayBtn || !leaveGoBtn) {
    return Promise.resolve(
      window.confirm(
        "当前内容尚未保存，确定要离开吗？未保存的修改将丢失。"
      )
    );
  }
  return new Promise((resolve) => {
    leaveDialogResolve = resolve;
    leaveDialog.hidden = false;
    leaveStayBtn.focus();
  });
}

leaveStayBtn?.addEventListener("click", () => finishLeaveDialog(false));
leaveGoBtn?.addEventListener("click", () => finishLeaveDialog(true));
leaveDialog
  ?.querySelector(".modal-leave__backdrop")
  ?.addEventListener("click", () => finishLeaveDialog(false));

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    leaveDialogResolve &&
    leaveDialog &&
    !leaveDialog.hidden
  ) {
    e.preventDefault();
    finishLeaveDialog(false);
  }
});

async function goToPostList() {
  if (!(await confirmLeaveIfDirtyAsync())) return;
  window.location.href = "admin.html";
}

function updateWriteToolbarVisibility() {
  const editing = Boolean(elId.value.trim());
  if (btnDiscardEdit) btnDiscardEdit.hidden = !editing;
  if (btnClearDraft) btnClearDraft.hidden = editing;
}

function clearForm() {
  elId.value = "";
  fTitle.value = "";
  fBody.value = "";
  setPostVisibilityFromServer(true, false);
  document.title = "新建文章 · 博客";
  selectedTags = [];
  if (tagCustomBlock) tagCustomBlock.hidden = true;
  resetCustomTagDraft();
  syncTagsHidden();
  renderTagPicker();
  schedulePreview();
  markDraftClean();
  updateWriteToolbarVisibility();
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

/** 预设标签：开发与工程向主题（图标 + 名称 组成存储用的 canonical） */
const PRESET_TAGS = [
  { icon: "🐍", name: "Python" },
  { icon: "🤖", name: "Android" },
  { icon: "🧪", name: "测试" },
  { icon: "⚡", name: "自动化" },
  { icon: "💻", name: "开发" },
  { icon: "🐳", name: "容器" },
  { icon: "🔀", name: "Git" },
  { icon: "☁️", name: "云端" },
];

/** 自定义标签可选图标：自动化 / 测试 / 开发 / 移动端 / 语言与基础设施等 */
const CUSTOM_TAG_ICON_CHOICES = [
  "🐍",
  "🤖",
  "🧪",
  "⚡",
  "💻",
  "🐳",
  "🔀",
  "☁️",
  "🖥️",
  "⌨️",
  "📱",
  "🔌",
  "🗄️",
  "🚀",
  "🛠️",
  "⚙️",
  "🔧",
  "📡",
  "🐧",
  "🌐",
  "📝",
  "🔒",
  "📜",
  "🧬",
];

const tagPresetGrid = document.getElementById("tag-preset-grid");
const tagSelectedChips = document.getElementById("tag-selected-chips");
const tagCustomBlock = document.getElementById("tag-custom-block");
const tagCustomIconGrid = document.getElementById("tag-custom-icon-grid");
const fTagCustomName = document.getElementById("f-tag-custom-name");
const btnTagToggleCustom = document.getElementById("btn-tag-toggle-custom");
const btnTagCustomAdd = document.getElementById("btn-tag-custom-add");
const btnTagCustomCancel = document.getElementById("btn-tag-custom-cancel");

/** @type {string[]} */
let selectedTags = [];
let customTagIconSelected = "";

function presetCanonical(p) {
  return `${p.icon}${p.name}`;
}

function isPresetCanonical(tag) {
  return PRESET_TAGS.some((p) => presetCanonical(p) === tag);
}

function normalizeTagFromServer(t) {
  const s = String(t).trim();
  if (!s) return "";
  for (const p of PRESET_TAGS) {
    if (s === p.name || s === presetCanonical(p)) return presetCanonical(p);
  }
  return s;
}

function syncTagsHidden() {
  if (fTags) fTags.value = selectedTags.join(",");
}

function renderPresetGrid() {
  if (!tagPresetGrid) return;
  tagPresetGrid.innerHTML = PRESET_TAGS.map((p) => {
    const val = presetCanonical(p);
    const on = selectedTags.includes(val);
    return `<button type="button" class="admin-tag-preset${on ? " is-selected" : ""}" data-tag="${escapeHtml(val)}" aria-pressed="${on ? "true" : "false"}"><span class="admin-tag-preset__icon" aria-hidden="true">${p.icon}</span><span class="admin-tag-preset__text">${escapeHtml(p.name)}</span></button>`;
  }).join("");
}

function renderCustomChips() {
  if (!tagSelectedChips) return;
  const customs = selectedTags.filter((t) => !isPresetCanonical(t));
  tagSelectedChips.innerHTML = customs
    .map((t) => {
      const enc = encodeURIComponent(t);
      return `<span class="admin-tag-chip"><span class="admin-tag-chip__label">${escapeHtml(t)}</span><button type="button" class="admin-tag-chip__remove" data-remove-tag="${enc}" aria-label="移除标签">×</button></span>`;
    })
    .join("");
  tagSelectedChips.querySelectorAll("[data-remove-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-remove-tag");
      const v = raw ? decodeURIComponent(raw) : "";
      selectedTags = selectedTags.filter((x) => x !== v);
      syncTagsHidden();
      renderTagPicker();
    });
  });
}

function renderTagPicker() {
  renderPresetGrid();
  renderCustomChips();
  renderCustomIconPickGrid();
}

function resetCustomTagDraft() {
  customTagIconSelected = "";
  if (fTagCustomName) fTagCustomName.value = "";
  renderCustomIconPickGrid();
}

function renderCustomIconPickGrid() {
  if (!tagCustomIconGrid) return;
  tagCustomIconGrid.innerHTML = CUSTOM_TAG_ICON_CHOICES.map((icon) => {
    const on = icon === customTagIconSelected;
    return `<button type="button" class="admin-tag-icon-pick__btn${on ? " is-selected" : ""}" data-pick-icon="${escapeHtml(icon)}" aria-pressed="${on ? "true" : "false"}" aria-label="图标 ${icon}"><span aria-hidden="true">${icon}</span></button>`;
  }).join("");
}

function initAdminTagPicker() {
  if (!tagPresetGrid || tagPresetGrid.dataset.bound) return;
  tagPresetGrid.dataset.bound = "1";
  tagPresetGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tag]");
    if (!btn || !tagPresetGrid.contains(btn)) return;
    const v = btn.getAttribute("data-tag");
    if (!v) return;
    const i = selectedTags.indexOf(v);
    if (i >= 0) selectedTags.splice(i, 1);
    else selectedTags.push(v);
    syncTagsHidden();
    renderTagPicker();
  });

  if (tagCustomIconGrid && !tagCustomIconGrid.dataset.bound) {
    tagCustomIconGrid.dataset.bound = "1";
    tagCustomIconGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pick-icon]");
      if (!btn || !tagCustomIconGrid.contains(btn)) return;
      const ic = btn.getAttribute("data-pick-icon");
      if (!ic || !CUSTOM_TAG_ICON_CHOICES.includes(ic)) return;
      customTagIconSelected = ic;
      renderCustomIconPickGrid();
    });
  }

  btnTagToggleCustom?.addEventListener("click", () => {
    if (!tagCustomBlock) return;
    const wasHidden = tagCustomBlock.hidden;
    tagCustomBlock.hidden = !tagCustomBlock.hidden;
    if (!tagCustomBlock.hidden && wasHidden) resetCustomTagDraft();
    if (tagCustomBlock.hidden) resetCustomTagDraft();
  });

  btnTagCustomCancel?.addEventListener("click", () => {
    if (tagCustomBlock) tagCustomBlock.hidden = true;
    resetCustomTagDraft();
  });

  btnTagCustomAdd?.addEventListener("click", () => {
    const name = (fTagCustomName?.value || "").trim();
    if (!customTagIconSelected) {
      showMainMsg("请选择一个标签图标", false);
      return;
    }
    if (!name) {
      showMainMsg("请填写标签文字", false);
      return;
    }
    const v = `${customTagIconSelected}${name}`;
    if (!selectedTags.includes(v)) selectedTags.push(v);
    resetCustomTagDraft();
    syncTagsHidden();
    renderTagPicker();
  });

  selectedTags = [];
  syncTagsHidden();
  renderTagPicker();
}

let mdLibsPromise = null;

function pickMarked(mod) {
  const m = mod?.marked ?? mod?.default ?? mod;
  if (m && typeof m.parse === "function") return m;
  throw new Error("marked 无效");
}

function pickPurify(mod) {
  const p = mod?.default ?? mod;
  if (p && typeof p.sanitize === "function") return p;
  throw new Error("DOMPurify 无效");
}

function applyMarkedOptions(marked) {
  if (!marked) return;
  if (typeof marked.setOptions === "function") {
    marked.setOptions({ gfm: true, breaks: false });
  } else if (typeof marked.use === "function") {
    try {
      marked.use({ gfm: true, breaks: false });
    } catch (_) {
      /* 部分版本 API 不同 */
    }
  }
}

function getMdLibs() {
  if (!mdLibsPromise) {
    mdLibsPromise = (async () => {
      const w = globalThis;
      if (w.marked && w.DOMPurify) {
        applyMarkedOptions(w.marked);
        return { marked: w.marked, DOMPurify: w.DOMPurify };
      }
      try {
        const [m, p] = await Promise.all([
          import("https://esm.sh/marked@12"),
          import("https://esm.sh/dompurify@3.1.6"),
        ]);
        const marked = pickMarked(m);
        const DOMPurify = pickPurify(p);
        applyMarkedOptions(marked);
        return { marked, DOMPurify };
      } catch (e) {
        console.warn("[写作台] Markdown 预览库加载失败", e);
        return null;
      }
    })();
  }
  return mdLibsPromise;
}

let previewDebounce = 0;

function schedulePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = window.setTimeout(() => {
    void runPreview();
  }, 140);
}

async function runPreview() {
  if (!mdPreviewEl || !fBody) return;
  const libs = await getMdLibs();
  const src = fBody.value || "";
  if (!libs) {
    mdPreviewEl.innerHTML = src
      ? `<p class="md-preview-fallback">无法加载预览引擎时仍可保存。以下为正文转义片段：</p><pre class="md-preview-raw">${escapeHtml(src.slice(0, 12000))}</pre>`
      : "";
    return;
  }
  try {
    const rawHtml = await Promise.resolve(libs.marked.parse(src));
    mdPreviewEl.innerHTML = libs.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ["target"],
    });
    mdPreviewEl.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  } catch (e) {
    mdPreviewEl.textContent = `预览出错：${e.message || String(e)}`;
  }
}

function initMdPreviewImageLightbox() {
  const box = document.getElementById("md-img-lightbox");
  const imgEl = document.getElementById("md-img-lightbox-img");
  const backdrop = box?.querySelector(".md-img-lightbox__backdrop");
  const closeBtn = box?.querySelector(".md-img-lightbox__close");
  if (!mdPreviewEl || !box || !imgEl || !backdrop || !closeBtn) return;
  if (mdPreviewEl.dataset.imgLightboxBound) return;
  mdPreviewEl.dataset.imgLightboxBound = "1";

  const close = () => {
    box.hidden = true;
    imgEl.removeAttribute("src");
    imgEl.alt = "";
    document.body.style.overflow = "";
  };

  mdPreviewEl.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const img = t.closest("img");
    if (!img || !mdPreviewEl.contains(img)) return;
    e.preventDefault();
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (!src) return;
    imgEl.src = src;
    imgEl.alt = img.getAttribute("alt") || "";
    box.hidden = false;
    document.body.style.overflow = "hidden";
  });

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !box.hidden) close();
  });
}

async function uploadAndInsertMarkdownImage(file) {
  if (!token()) {
    showMainMsg("请先登录后再上传图片", false);
    showToast("请先登录后再上传图片", "err", 5000);
    return;
  }
  showToast("正在上传图片…", "info", 0);
  try {
    const url = await uploadImage(file);
    const alt =
      (file.name && file.name.replace(/\.[^.]+$/, "")) || "图片";
    insertAtCursor(fBody, `\n![${alt}](${url})\n`);
    schedulePreview();
    dismissToast();
    showToast("图片已上传并插入正文", "ok", 5000);
  } catch (e) {
    dismissToast();
    const msg = e.message || "上传失败";
    showMainMsg(msg, false);
    showToast(msg, "err", 5500);
  }
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  const v = ta.value;
  ta.value = v.slice(0, start) + text + v.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/api/upload"), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || "上传失败");
  }
  if (!res.ok) throw new Error(data.error || "上传失败");
  return data.url;
}

async function initEditorFromUrl() {
  const q = new URLSearchParams(window.location.search).get("id");
  showMainMsg("");
  if (q && /^\d+$/.test(q)) {
    try {
      const p = await api(`${postsBase()}/${q}`);
      elId.value = String(p.id);
      fTitle.value = p.title;
      selectedTags = (p.tags || []).map(normalizeTagFromServer).filter(Boolean);
      syncTagsHidden();
      renderTagPicker();
      fBody.value = p.body_md || "";
      setPostVisibilityFromServer(!!p.published, !!p.draft);
      const t = p.title || "文章";
      const short = t.length > 28 ? `${t.slice(0, 28)}…` : t;
      document.title = `编辑：${short} · 写作`;
    } catch (e) {
      showMainMsg(e.message || "读取失败", false);
      clearForm();
    }
  } else {
    clearForm();
  }
  schedulePreview();
  markDraftClean();
  updateWriteToolbarVisibility();
}

async function savePost() {
  showMainMsg("");
  const { published, draft } = getPublishedDraftForSave();
  const payload = {
    title: fTitle.value.trim(),
    body_md: fBody.value,
    published,
    draft,
    tags: selectedTags.slice(),
  };
  const id = elId.value.trim();
  try {
    if (id) {
      await api(`${postsBase()}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      markDraftClean();
      showToast("已保存 · 修改已写入服务器", "ok", 4800);
    } else {
      await api(postsBase(), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      markDraftClean();
      sessionStorage.setItem(
        "admin_flash",
        JSON.stringify({ msg: "已创建 · 新文章已加入列表", type: "ok" })
      );
      window.location.href = "admin.html";
    }
  } catch (e) {
    showMainMsg(e.message || "保存失败", false);
    showToast(e.message || "保存失败", "err", 5500);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentRole = "user";
  window.location.href = "index.html";
}

async function enterEditorMain() {
  document.documentElement.classList.add("admin-token-present");
  panelAuth.hidden = true;
  panelMain.hidden = false;
  await syncSiteHeader("");
  void initEditorFromUrl();
}

async function restoreSession() {
  if (!token()) {
    document.documentElement.classList.remove("admin-token-present");
    await syncSiteHeader("");
    return;
  }
  try {
    const me = await api("/api/auth/me");
    currentRole = me.role || "user";
    await enterEditorMain();
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
    await enterEditorMain();
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

btnSave.addEventListener("click", savePost);

btnDiscardEdit?.addEventListener("click", () => {
  void goToPostList();
});

btnClearDraft?.addEventListener("click", async () => {
  if (!(await confirmLeaveIfDirtyAsync())) return;
  showMainMsg("");
  clearForm();
  window.history.replaceState({}, "", "write.html");
});

writeBackList?.addEventListener("click", (e) => {
  e.preventDefault();
  void goToPostList();
});

window.addEventListener("beforeunload", (e) => {
  if (isDraftDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

fBody?.addEventListener("input", () => schedulePreview());

fBody?.addEventListener("paste", async (e) => {
  if (!token()) return;
  const cd = e.clipboardData;
  if (!cd?.items?.length) return;
  const images = [];
  for (const it of cd.items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) images.push(f);
    }
  }
  if (!images.length) return;
  e.preventDefault();
  const n = images.length;
  showToast(
    n > 1 ? `正在上传 ${n} 张图片…` : "正在上传图片…",
    "info",
    0
  );
  showMainMsg(`正在上传 ${n} 张图片…`, true);
  try {
    for (const file of images) {
      const url = await uploadImage(file);
      const alt =
        (file.name && file.name.replace(/\.[^.]+$/, "")) || "粘贴图片";
      insertAtCursor(fBody, `\n![${alt}](${url})\n`);
    }
    schedulePreview();
    dismissToast();
    showToast(
      n > 1 ? `已插入 ${n} 张图片（剪贴板）` : "图片已从剪贴板插入正文",
      "ok",
      5000
    );
  } catch (err) {
    dismissToast();
    const msg = err.message || "粘贴上传失败";
    showMainMsg(msg, false);
    showToast(msg, "err", 5500);
  }
});

inputImage?.addEventListener("change", async () => {
  const file = inputImage.files?.[0];
  inputImage.value = "";
  if (!file) return;
  await uploadAndInsertMarkdownImage(file);
});

document.querySelectorAll("[data-md-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-md-mode") || "split";
    if (mdPanesEl) {
      mdPanesEl.className = `md-panes md-panes--${mode}`;
    }
    document.querySelectorAll(".md-mode-tab").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  });
});

if (window.location.hash === "#login") {
  document.getElementById("panel-auth")?.scrollIntoView({ behavior: "smooth" });
}

initMdPreviewImageLightbox();
initAdminTagPicker();
initBrandMetaBar();
void restoreSession();
