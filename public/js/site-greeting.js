/**
 * 顶栏时段问候：按访客浏览器本地时间划分上午 / 下午 / 晚上
 * 5:00–11:59 → 上午；12:00–17:59 → 下午；其余 → 晚上
 *
 * 称呼优先级：已登录访客网名/用户名 → 站长 SITE_OWNER_NAME →「朋友」
 */

/** @type {{ owner: string | null; viewer: string | null }} */
const ctx = { owner: null, viewer: null };

/**
 * 更新问候上下文（只传需要改的字段）
 * @param {{ ownerDisplayName?: string | null; viewerDisplayName?: string | null }} patch
 */
export function setBrandGreetingContext(patch) {
  if ("ownerDisplayName" in patch) {
    ctx.owner =
      patch.ownerDisplayName != null && String(patch.ownerDisplayName).trim()
        ? String(patch.ownerDisplayName).trim()
        : null;
  }
  if ("viewerDisplayName" in patch) {
    ctx.viewer =
      patch.viewerDisplayName != null && String(patch.viewerDisplayName).trim()
        ? String(patch.viewerDisplayName).trim()
        : null;
  }
}

/**
 * @returns {string} 如「上午好」「下午好」「晚上好」
 */
export function timeGreetingWord() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "上午好";
  if (h >= 12 && h < 18) return "下午好";
  return "晚上好";
}

/**
 * @param {HTMLElement | null} el #brand-greeting
 */
export function applyBrandGreeting(el) {
  if (!el) return;
  const who = ctx.viewer || ctx.owner || "朋友";
  el.textContent = `${timeGreetingWord()}，${who}！`;
}
