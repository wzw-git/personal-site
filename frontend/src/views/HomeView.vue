<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { authStore } from "@/stores/auth";

const router = useRouter();

const posts = ref([]);
const site = ref(null);
const err = ref("");
const activeTag = ref(null);
const tagList = computed(() => {
  const set = new Set();
  for (const p of posts.value) {
    for (const t of p.tags || []) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
});
const filtered = computed(() => {
  if (!activeTag.value) return posts.value;
  return posts.value.filter((p) => (p.tags || []).includes(activeTag.value));
});

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function load() {
  err.value = "";
  try {
    const r = await fetch("/api/posts", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    site.value = data.site || null;
    posts.value = [...(data.posts || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    document.title = "博客 · 文章列表";
    const desc = (site.value?.blogDescription || "").trim().slice(0, 200);
    if (desc) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
      }
      m.setAttribute("content", desc);
    }
  } catch (e) {
    console.error(e);
    err.value =
      "无法连接 /api/posts。请确认 Docker 已启动且 Nginx 将 /api 反代到 Node。";
  }
}

function authorLine(p) {
  const a = p.author;
  if (!a) return "";
  if (typeof a === "string") {
    return `<p class="post-card__author">作者 · ${esc(a)}</p>`;
  }
  if (a.username) {
    const name = esc(a.displayName || a.username);
    const href = `/profile.html?u=${encodeURIComponent(a.username)}`;
    return `<p class="post-card__author post-card__author--row"><span>作者 · <a href="${href}">${name}</a></span></p>`;
  }
  return "";
}

/** 整卡进入文章：避免纯 CSS 透明链接触发层在部分浏览器下无法命中 */
function openPostCard(p, e) {
  if (e.defaultPrevented) return;
  if (e.target.closest("a, button")) return;
  void router.push({ name: "post", params: { id: String(p.id) } });
}

onMounted(() => {
  void load();
  void authStore.fetchMe();
});
</script>

<template>
  <main class="main--home">
    <div v-if="authStore.loggedIn" id="write-cta" class="home-write-cta">
      <a class="home-write-cta__link" href="/write.html">
        <span class="home-write-cta__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </span>
        <span class="home-write-cta__body">
          <span class="home-write-cta__title">开始写作</span>
          <span class="home-write-cta__sub">打开编辑器，支持 Markdown 与图片粘贴</span>
        </span>
        <span class="home-write-cta__chev" aria-hidden="true">→</span>
      </a>
    </div>

    <div
      v-show="tagList.length && !err"
      class="tag-bar card"
      id="tag-bar-wrap"
    >
      <span class="tag-bar__label">按标签筛选</span>
      <div class="tag-chips" role="toolbar" aria-label="标签筛选">
        <button
          type="button"
          class="tag-chip"
          :class="{ 'is-active': activeTag === null }"
          @click="activeTag = null"
        >
          全部
        </button>
        <button
          v-for="t in tagList"
          :key="t"
          type="button"
          class="tag-chip"
          :class="{ 'is-active': activeTag === t }"
          @click="activeTag = t"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <p v-if="err" class="blog-empty" v-html="err" />

    <ul v-else-if="!filtered.length" class="post-list">
      <li><p class="blog-empty">暂无文章，或没有符合标签的条目。</p></li>
    </ul>

    <ul v-else class="post-list" aria-live="polite">
      <li v-for="p in filtered" :key="p.id">
        <article class="post-card post-card--clickable" @click="openPostCard(p, $event)">
          <RouterLink class="post-card__hit" :to="`/post/${p.id}`" @click.stop>
            <time class="post-card__time" :datetime="p.date">{{ p.date }}</time>
            <h2 class="post-card__title">{{ p.title }}</h2>
          </RouterLink>
          <div v-html="authorLine(p)" />
          <div
            v-if="(p.tags || []).length"
            class="post-card__tags"
          >
            <span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span>
          </div>
        </article>
      </li>
    </ul>

    <footer class="site-footer site-footer--home vue-home-footer">
      <p class="site-footer__meta">
        前端：Vue 3 + Vite · 数据 MySQL · 详见
        <a href="/博客说明.html" class="site-footer__link">说明</a>
      </p>
    </footer>
  </main>
</template>
