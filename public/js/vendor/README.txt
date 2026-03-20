说明（文章页 post.html）：

  优先 ① window.marked + window.DOMPurify（UMD，见 post.html 引用的两个脚本）
  ② 本目录 marked.min.mjs + purify.min.mjs（动态 import，需 Nginx 将 .mjs 标为 application/javascript）
  ③ esm.sh CDN
  ④ post-view.js 内置子集解析（无外网时）

推荐（国内 / 无外网）：下载 UMD 到本目录，文件名须与 post.html 一致：

  marked.umd.min.js  ← https://cdn.jsdelivr.net/npm/marked@12/lib/marked.umd.min.js
  purify.min.js       ← https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js

或 ESM（动态 import）：

  curl -fsSL "https://cdn.jsdelivr.net/npm/marked@12/+esm" -o public/js/vendor/marked.min.mjs
  curl -fsSL "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm" -o public/js/vendor/purify.min.mjs
