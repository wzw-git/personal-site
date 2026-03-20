这是一套**纯静态**个人博客：把 `nginx` 的网站根目录指向 `personal-site` 即可访问，无需 Node 构建。

## 如何发布新文章

1. 在 `posts/` 下新建 `你的slug.md`（文件名与 slug 一致，建议小写与连字符）。
2. 打开 `data/posts.json`，在 `posts` 数组里追加一条元数据：`slug`、`title`、`date`、`excerpt`、`tags`、`draft`。
3. 保存后刷新首页 `index.html`；正文页地址为 `post.html?slug=你的slug`。

元数据与正文分离，是为了让列表页只读一份 JSON，加载更快；正文仍用 Markdown 保持写作体验。

## 设计取舍

- **标签筛选**：在文章列表页点击标签即可过滤。
- **安全**：正文经 [marked](https://marked.js.org/) 解析后，会用 [DOMPurify](https://github.com/cure53/DOMPurify) 做 HTML 消毒，降低 XSS 风险。
- **草稿**：`draft: true` 的文章不会出现在列表；若知道链接仍可打开（并显示草稿提示），便于本地预览。

## 下一步你可以

- 修改 `styles.css` 里博客相关样式，统一成自己的品牌色。
- 将 `data/posts.json` 里的 `canonicalBase` 换成真实域名，便于以后接 RSS 或分享卡片。

感谢阅读，祝写作愉快。
