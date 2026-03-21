<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { authStore } from "@/stores/auth";

const props = defineProps({
  id: { type: String, required: true },
});

const route = useRoute();
const loading = ref(true);
const err = ref("");
const meta = ref(null);
const bodyHtml = ref("");
const comments = ref([]);
const draft = ref("");
const submitErr = ref("");
const submitting = ref(false);

/** 防止快速切换路由时旧请求后返回覆盖新文章 */
let loadEpoch = 0;

const postId = computed(() => Number(props.id || route.params.id));

async function loadPost() {
  const id = postId.value;
  if (!Number.isInteger(id) || id < 1) {
    err.value = "文章 id 不合法";
    loading.value = false;
    return;
  }
  const epoch = ++loadEpoch;
  loading.value = true;
  err.value = "";
  try {
    const r = await fetch(`/api/posts/id/${id}`, { cache: "no-cache" });
    if (epoch !== loadEpoch) return;
    if (!r.ok) {
      err.value = r.status === 404 ? "文章不存在或未发布。" : `加载失败 (${r.status})`;
      meta.value = null;
      bodyHtml.value = "";
      loading.value = false;
      return;
    }
    const data = await r.json();
    if (epoch !== loadEpoch) return;
    meta.value = data;
    const raw = marked.parse(data.body_md || "");
    bodyHtml.value = DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
    document.title = `${data.title || "文章"} · 博客`;
    await loadComments(epoch);
  } catch (e) {
    if (epoch !== loadEpoch) return;
    console.error(e);
    err.value = "无法加载文章。";
  } finally {
    if (epoch === loadEpoch) loading.value = false;
  }
}

async function loadComments(forEpoch) {
  const id = postId.value;
  try {
    const r = await fetch(`/api/posts/id/${id}/comments`, { cache: "no-cache" });
    if (forEpoch !== loadEpoch) return;
    if (!r.ok) {
      comments.value = [];
      return;
    }
    const data = await r.json();
    if (forEpoch !== loadEpoch) return;
    comments.value = data.comments || [];
  } catch {
    if (forEpoch === loadEpoch) comments.value = [];
  }
}

async function submitComment() {
  submitErr.value = "";
  const epochAtSubmit = loadEpoch;
  const text = draft.value.trim();
  if (!text) {
    submitErr.value = "请输入评论内容";
    return;
  }
  if (!authStore.state.token) {
    submitErr.value = "请先登录后再评论";
    return;
  }
  submitting.value = true;
  try {
    const r = await fetch(`/api/posts/id/${postId.value}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.state.token.trim()}`,
      },
      body: JSON.stringify({ body: text }),
    });
    const rawText = await r.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    if (!r.ok) {
      submitErr.value = formatCommentSubmitError(r.status, rawText, data);
      return;
    }
    draft.value = "";
    await loadComments(epochAtSubmit);
  } catch {
    submitErr.value = "网络错误";
  } finally {
    submitting.value = false;
  }
}

async function removeComment(c) {
  if (!confirm("确定删除这条评论？")) return;
  const epochAtDel = loadEpoch;
  try {
    const r = await fetch(`/api/comments/${c.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.state.token.trim()}` },
    });
    if (r.ok) await loadComments(epochAtDel);
  } catch {
    /* 忽略 */
  }
}

function canDelete(c) {
  if (!authStore.loggedIn || !authStore.state.me) return false;
  const u = authStore.state.me.username;
  const role = authStore.state.me.role;
  return c.author?.username === u || role === "admin";
}

function authorName(a) {
  if (!a) return "";
  return a.displayName || a.username || "";
}

/** 将评论接口返回的 HTML 错误页（如旧版 API 的 Cannot POST）转成可读说明 */
function formatCommentSubmitError(status, rawText, data) {
  const t = String(rawText || "");
  if (t.includes("Cannot POST") || /<\s*!DOCTYPE/i.test(t)) {
    return "评论接口未启用：请在服务器执行 docker compose up -d --build api 更新 API 镜像后重试。";
  }
  if (data?.error) return String(data.error);
  const plain = t.replace(/<[^>]+>/g, "").trim();
  if (plain && plain.length < 280) return plain;
  return `请求失败（HTTP ${status}）`;
}

watch(
  () => route.params.id,
  () => {
    void loadPost();
  }
);

onMounted(() => {
  void authStore.fetchMe();
  void loadPost();
});
</script>

<template>
  <main>
    <p v-if="loading" class="blog-empty">加载中…</p>
    <p v-else-if="err" class="blog-empty">{{ err }}</p>

    <article v-else-if="meta" id="post-article" class="post-article">
      <header class="post-header">
        <h1 class="post-header__title" id="post-title">{{ meta.title }}</h1>
        <div class="post-header__meta">
          <time :datetime="meta.date">{{ meta.date }}<template v-if="meta.updatedDate"> · 更新 {{ meta.updatedDate }}</template></time>
          <span v-if="meta.author?.username" class="post-author post-author--row">
            <span>作者 · <a :href="`/profile.html?u=${encodeURIComponent(meta.author.username)}`">{{ authorName(meta.author) }}</a></span>
          </span>
          <div v-if="(meta.tags || []).length" class="post-header__tags">
            <span v-for="t in meta.tags" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
      </header>

      <div id="post-body" class="prose" v-html="bodyHtml" />

      <div class="auth-panel vue-comment-panel" role="region" aria-label="评论">
        <h2 class="vue-comment-panel__title">评论</h2>

        <div class="vue-comment-thread">
          <ul v-if="comments.length" class="vue-comment-list">
            <li v-for="c in comments" :key="c.id" class="vue-comment-item">
              <div class="vue-comment-item__head">
                <a
                  v-if="c.author?.username"
                  class="vue-comment-item__author"
                  :href="`/profile.html?u=${encodeURIComponent(c.author.username)}`"
                >{{ authorName(c.author) }}</a>
                <span v-else class="vue-comment-item__author vue-comment-item__author--guest">访客</span>
                <time class="vue-comment-item__time" :datetime="c.date">{{ c.date }}</time>
                <button
                  v-if="canDelete(c)"
                  type="button"
                  class="vue-comment-item__del"
                  @click="removeComment(c)"
                >
                  删除
                </button>
              </div>
              <p class="vue-comment-item__body">{{ c.body }}</p>
            </li>
          </ul>
          <p v-else class="vue-comment-empty">暂无评论，欢迎抢沙发。</p>
        </div>

        <div v-if="authStore.loggedIn" class="vue-comment-write">
          <div class="admin-field vue-comment-field">
            <label for="comment-draft">评论内容</label>
            <textarea
              id="comment-draft"
              v-model="draft"
              class="vue-comment-textarea"
              rows="4"
              maxlength="2000"
              placeholder="想说点什么… 纯文本，最多 2000 字"
            />
          </div>
          <button
            type="button"
            class="btn btn-primary auth-submit"
            :disabled="submitting"
            @click="submitComment"
          >
            {{ submitting ? "发送中…" : "发表评论" }}
          </button>
          <div v-if="submitErr" class="admin-msg err" role="alert">{{ submitErr }}</div>
        </div>
        <p v-else class="vue-comment-login-hint">
          <RouterLink to="/login">登录</RouterLink> 后可发表评论。
        </p>
      </div>

      <footer class="post-footer">
        <RouterLink class="btn btn-primary" to="/">← 返回列表</RouterLink>
      </footer>
    </article>
  </main>
</template>
