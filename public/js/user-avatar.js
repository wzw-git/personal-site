/**
 * 用户头像 HTML：有地址则 img，否则 SVG 默认用户图标
 */

const SVG_PLACEHOLDER = `<svg class="user-avatar__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="12" cy="8" r="3.25" stroke="currentColor" stroke-width="1.6"/>
  <path d="M5.5 19.25c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

function escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * @param {string | null | undefined} avatarUrl
 * @param {{ classExtra?: string; large?: boolean }} [opts]
 */
export function renderUserAvatarHtml(avatarUrl, opts = {}) {
  const u = avatarUrl && String(avatarUrl).trim();
  const extra = opts.classExtra ? ` ${opts.classExtra}` : "";
  const lg = opts.large ? " user-avatar--lg" : "";
  if (u) {
    return `<span class="user-avatar${lg}${extra}"><img class="user-avatar__img" src="${escAttr(u)}" alt="" loading="lazy" decoding="async" /></span>`;
  }
  return `<span class="user-avatar user-avatar--placeholder${lg}${extra}" aria-hidden="true">${SVG_PLACEHOLDER}</span>`;
}
