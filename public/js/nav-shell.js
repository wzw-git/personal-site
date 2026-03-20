/**
 * 统一顶栏：登录后显示「写作」「退出」，访客显示「登录」；
 * 顶栏头像链至 profile.html（未登录亦可点，资料页会引导登录）；品牌文字仍回首页。
 */
import { apiUrl } from "./api-base.js";
import { applyBrandGreeting, setBrandGreetingContext } from "./site-greeting.js";
import { renderUserAvatarHtml } from "./user-avatar.js";

export const AUTH_TOKEN_KEY = "blog_admin_token";

/**
 * @param {"home"|"write"|"profile"|"post"|"docs"|""} currentPage — 用于 aria-current
 */
export async function initSiteNav(currentPage = "") {
  const authEls = document.querySelectorAll("[data-nav-auth]");
  const guestEls = document.querySelectorAll("[data-nav-guest]");
  const logoutBtn =
    document.getElementById("nav-logout") || document.getElementById("btn-logout");
  const brandAvatarSlot = document.getElementById("brand-avatar-slot");
  const brandBioEl = document.getElementById("brand-bio");

  let loggedIn = false;
  /** @type {{ avatarUrl?: string | null; bio?: string | null } | null} */
  let me = null;
  const t = localStorage.getItem(AUTH_TOKEN_KEY);
  if (t) {
    try {
      const r = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-cache",
      });
      if (r.ok) {
        loggedIn = true;
        me = await r.json();
      }
    } catch {
      loggedIn = false;
      me = null;
    }
  }

  if (brandAvatarSlot) {
    const url = loggedIn && me?.avatarUrl ? String(me.avatarUrl).trim() : null;
    brandAvatarSlot.innerHTML = renderUserAvatarHtml(url || null, {
      classExtra: "user-avatar--brand",
    });
  }

  if (brandBioEl) {
    const raw = loggedIn && me?.bio != null ? String(me.bio) : "";
    const bioText = raw.trim().replace(/\n+/g, " ");
    if (bioText) {
      brandBioEl.textContent = bioText;
      brandBioEl.title = bioText.length > 80 ? bioText : "";
      brandBioEl.hidden = false;
    } else {
      brandBioEl.textContent = "";
      brandBioEl.removeAttribute("title");
      brandBioEl.hidden = true;
    }
  }

  setBrandGreetingContext({
    viewerDisplayName: loggedIn && me ? me.displayName || me.username : null,
  });
  const greetEl = document.getElementById("brand-greeting");
  if (greetEl) applyBrandGreeting(greetEl);

  authEls.forEach((el) => {
    el.hidden = !loggedIn;
  });
  guestEls.forEach((el) => {
    el.hidden = loggedIn;
  });

  if (logoutBtn) {
    logoutBtn.hidden = !loggedIn;
    if (!logoutBtn.dataset.navLogoutBound) {
      logoutBtn.dataset.navLogoutBound = "1";
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        window.location.href = "index.html";
      });
    }
  }

  document.querySelectorAll("[data-nav-page]").forEach((a) => {
    a.removeAttribute("aria-current");
  });
  if (currentPage) {
    document.querySelectorAll("[data-nav-page]").forEach((a) => {
      if (a.getAttribute("data-nav-page") === currentPage) {
        a.setAttribute("aria-current", "page");
      }
    });
  }
}
