/**
 * 个人资料：无 ?u= 时编辑本人；带 ?u=登录名 时只读查看他人
 */
import { apiUrl } from "./api-base.js";
import { initSiteNav, AUTH_TOKEN_KEY } from "./nav-shell.js";
import { renderUserAvatarHtml } from "./user-avatar.js";

/** 保存后刷新顶栏头像与个性签名等 */
function refreshSiteNav() {
  void initSiteNav("profile");
}

const msgEl = document.getElementById("profile-msg");
const viewWrap = document.getElementById("profile-view");
const editWrap = document.getElementById("profile-edit");
const titleEl = document.getElementById("profile-heading");
const viewName = document.getElementById("view-display-name");
const viewUser = document.getElementById("view-username");
const viewBio = document.getElementById("view-bio");
const pfUsernameDisplay = document.getElementById("pf-username-display");
const fDisplay = document.getElementById("pf-display");
const fBio = document.getElementById("pf-bio");
const btnSave = document.getElementById("pf-save");
const viewAvatarSlot = document.getElementById("view-avatar");
const pfAvatarSlot = document.getElementById("pf-avatar-slot");
const pfAvatarHit = document.getElementById("pf-avatar-hit");
const pfAvatarFile = document.getElementById("pf-avatar-file");
const pfAvatarReset = document.getElementById("pf-avatar-reset");

/** @type {string | null} */
let selfAvatarUrl = null;

function token() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function showMsg(text, ok) {
  if (!msgEl) return;
  msgEl.textContent = "";
  if (!text) return;
  const div = document.createElement("div");
  div.className = `flat-msg ${ok ? "ok" : "err"}`;
  div.textContent = text;
  msgEl.appendChild(div);
}

function setAvatarSlot(el, url) {
  if (!el) return;
  el.innerHTML = renderUserAvatarHtml(url, { large: true });
}

function updateSelfAvatarUi() {
  setAvatarSlot(pfAvatarSlot, selfAvatarUrl);
  if (pfAvatarReset) {
    pfAvatarReset.hidden = !selfAvatarUrl;
  }
}

async function loadPublic(username) {
  const pathUser = encodeURIComponent(username);
  const res = await fetch(apiUrl(`/api/users/${pathUser}/profile`), {
    cache: "no-cache",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (titleEl) titleEl.textContent = data.displayName || data.username;
  setAvatarSlot(viewAvatarSlot, data.avatarUrl);
  if (viewName) viewName.textContent = data.displayName || data.username;
  if (viewUser) viewUser.textContent = `@${data.username}`;
  if (viewBio) {
    viewBio.textContent = (data.bio && String(data.bio).trim()) || "暂无个性签名";
    viewBio.classList.toggle("profile-bio--empty", !String(data.bio || "").trim());
  }
  if (viewWrap) viewWrap.hidden = false;
  if (editWrap) editWrap.hidden = true;
}

async function loadSelf() {
  const t = token();
  if (!t) {
    window.location.replace("admin.html#login");
    return;
  }
  const res = await fetch(apiUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-cache",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (titleEl) titleEl.textContent = "我的资料";
  selfAvatarUrl = data.avatarUrl || null;
  updateSelfAvatarUi();
  if (pfUsernameDisplay) {
    pfUsernameDisplay.textContent = data.username ? `@${data.username}` : "—";
  }
  if (fDisplay) fDisplay.value = data.displayName || data.username || "";
  if (fBio) fBio.value = data.bio || "";
  if (viewWrap) viewWrap.hidden = true;
  if (editWrap) editWrap.hidden = false;
}

btnSave?.addEventListener("click", async () => {
  showMsg("");
  const t = token();
  if (!t) {
    window.location.replace("admin.html#login");
    return;
  }
  const displayName = (fDisplay?.value || "").trim();
  const bio = fBio?.value || "";
  try {
    const res = await fetch(apiUrl("/api/me/profile"), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ displayName, bio }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showMsg("资料已保存。", true);
    if (pfUsernameDisplay) {
      pfUsernameDisplay.textContent = data.username ? `@${data.username}` : "—";
    }
    if (fDisplay) fDisplay.value = data.displayName || "";
    if (fBio) fBio.value = data.bio || "";
    if (data.avatarUrl !== undefined) selfAvatarUrl = data.avatarUrl;
    updateSelfAvatarUi();
    refreshSiteNav();
  } catch (e) {
    showMsg(e.message || "保存失败", false);
  }
});

pfAvatarHit?.addEventListener("click", () => pfAvatarFile?.click());

pfAvatarFile?.addEventListener("change", async () => {
  const file = pfAvatarFile.files?.[0];
  pfAvatarFile.value = "";
  if (!file) return;
  const t = token();
  if (!t) {
    window.location.replace("admin.html#login");
    return;
  }
  showMsg("");
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(apiUrl("/api/me/avatar"), {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    selfAvatarUrl = data.avatarUrl || null;
    updateSelfAvatarUi();
    refreshSiteNav();
    showMsg("头像已更新", true);
  } catch (e) {
    showMsg(e.message || "头像上传失败", false);
  }
});

pfAvatarReset?.addEventListener("click", async () => {
  const t = token();
  if (!t) {
    window.location.replace("admin.html#login");
    return;
  }
  showMsg("");
  try {
    const res = await fetch(apiUrl("/api/me/avatar"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    selfAvatarUrl = null;
    updateSelfAvatarUi();
    refreshSiteNav();
    showMsg("已恢复默认头像", true);
  } catch (e) {
    showMsg(e.message || "操作失败", false);
  }
});

async function main() {
  await initSiteNav("profile");
  const params = new URLSearchParams(window.location.search);
  const u = (params.get("u") || "").trim();
  showMsg("");
  try {
    if (u) {
      await loadPublic(u);
    } else {
      await loadSelf();
    }
  } catch (e) {
    showMsg(e.message || "加载失败", false);
    if (viewWrap) viewWrap.hidden = true;
    if (editWrap) editWrap.hidden = true;
  }
}

main();
