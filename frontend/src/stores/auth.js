/**
 * 与旧版 nav-shell 共用 localStorage 键，登录态在 Vue 页与 admin/write 间互通
 */
import { reactive } from "vue";

const TOKEN_KEY = "blog_admin_token";

const state = reactive({
  token: typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : "",
  me: null,
});

/** 合并并发 fetchMe，避免多组件同时拉 /me 时响应乱序导致误清 token */
let fetchMeInFlight = null;

export const authStore = {
  state,
  get loggedIn() {
    return !!(state.token && state.me);
  },
  async fetchMe() {
    if (!state.token) {
      state.me = null;
      return;
    }
    if (fetchMeInFlight) return fetchMeInFlight;
    fetchMeInFlight = (async () => {
      try {
        const r = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${state.token}` },
          cache: "no-cache",
        });
        if (r.ok) {
          state.me = await r.json();
          return;
        }
        // 仅 401 视为令牌失效；502/503 等勿清空，否则用户仍显示已登录但提交评论会莫名失败
        if (r.status === 401) {
          state.me = null;
          state.token = "";
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        state.me = null;
      }
    })();
    try {
      await fetchMeInFlight;
    } finally {
      fetchMeInFlight = null;
    }
  },
  setToken(t) {
    state.token = t || "";
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  },
  logout() {
    this.setToken("");
    state.me = null;
  },
};
