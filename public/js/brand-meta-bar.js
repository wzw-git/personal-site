/**
 * 顶栏时间与天气（与首页一致，多页复用）+ 站点问候与导航同步
 */
import { apiUrl } from "./api-base.js";
import { initSiteNav } from "./nav-shell.js";
import { applyBrandGreeting, setBrandGreetingContext } from "./site-greeting.js";

/**
 * 拉取站长显示名、刷新导航与「晚上好，xxx」问候
 * @param {"home"|"write"|"profile"|"post"|"docs"|""} navPage
 */
export async function syncSiteHeader(navPage) {
  try {
    const r = await fetch(apiUrl("/api/site"), { cache: "no-cache" });
    if (r.ok) {
      const s = await r.json();
      setBrandGreetingContext({
        ownerDisplayName: s.ownerDisplayName ?? null,
      });
    }
  } catch {
    /* 离线时仍可用访客问候 */
  }
  await initSiteNav(navPage);
  const greetEl = document.getElementById("brand-greeting");
  if (greetEl) applyBrandGreeting(greetEl);
}

/** 启动时钟与天气轮询；若页面无对应 DOM 则静默跳过 */
export function initBrandMetaBar() {
  const homeDatetimeEl = document.getElementById("home-datetime");
  const homeWeatherEl = document.getElementById("home-weather");
  if (!homeDatetimeEl && !homeWeatherEl) return;

  function tickHomeClock() {
    if (!homeDatetimeEl) return;
    const d = new Date();
    const wk = "日一二三四五六"[d.getDay()];
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    homeDatetimeEl.setAttribute("datetime", d.toISOString());
    homeDatetimeEl.textContent = `${yyyy}-${mm}-${dd} 周${wk} ${hh}:${mi}:${ss}`;
  }

  async function fetchHomeWeather() {
    if (!homeWeatherEl) return;
    try {
      const r = await fetch(apiUrl("/api/climate"), { cache: "no-cache" });
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        homeWeatherEl.textContent = `天气数据异常（HTTP ${r.status}）`;
        return;
      }
      if (!j.ok) {
        homeWeatherEl.textContent = j.error || "天气暂不可用";
        return;
      }
      const city = j.city ? String(j.city) : "";
      const info = j.info ? String(j.info) : "";
      const temp =
        j.temperature != null && String(j.temperature).trim() !== ""
          ? `${String(j.temperature).replace(/\\\//g, "/")}℃`
          : "";
      const parts = [city, info, temp].filter(Boolean);
      homeWeatherEl.textContent = parts.length ? parts.join(" ") : "暂无实况";
    } catch {
      homeWeatherEl.textContent = "无法连接天气服务";
    }
  }

  tickHomeClock();
  window.setInterval(tickHomeClock, 1000);
  void fetchHomeWeather();
  window.setInterval(fetchHomeWeather, 30 * 60 * 1000);
}
