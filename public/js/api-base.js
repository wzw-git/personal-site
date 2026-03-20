/**
 * 将站点根下的 API 路径解析为当前页面所在目录下的实际路径。
 * 根部署：/api/auth/login → /api/auth/login
 * 子路径：/blog/admin.html 下同一请求 → /blog/api/auth/login
 *
 * 基准 URL 只用 origin + pathname 的目录部分，不用整段 location.href：
 * Safari 在少数版本/场景下，用含 #（如 admin.html#login）或 ? 的字符串作 new URL() 的 base 时，
 * 可能与 Chrome 解析结果不一致，导致算错 pathname、请求打到 Nginx 静态站 → 404。
 * @param {string} rootPath 以 / 开头，如 "/api/auth/login"
 */
export function apiUrl(rootPath) {
  const rel = String(rootPath).replace(/^\/+/, "");
  const { origin, pathname } = window.location;
  const p = pathname || "/";
  const slash = p.lastIndexOf("/");
  const basePath = slash <= 0 ? "/" : p.slice(0, slash + 1);
  return new URL(rel, origin + basePath).pathname;
}
