/**
 * 跳转到静态后台登录页。
 * 部分浏览器（尤其 Safari）在 History 路由页（如 /post/1）上直接点 /admin.html#login 时，
 * 偶发解析异常或与服务端路径组合出非预期请求；用 URL API 基于站点 base 拼绝对地址更稳。
 */
export function redirectToAdminLogin() {
  let basePath = import.meta.env.BASE_URL || "/";
  if (!basePath.endsWith("/")) basePath += "/";
  const u = new URL("admin.html", `${window.location.origin}${basePath}`);
  u.hash = "login";
  window.location.replace(u.href);
  return false;
}
