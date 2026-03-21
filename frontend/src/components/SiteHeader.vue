<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { authStore } from "@/stores/auth";

const route = useRoute();
const ownerName = ref(null);
const clockText = ref("");
const weatherText = ref("天气加载中…");
let clockTimer = 0;
let weatherTimer = 0;

const greeting = computed(() => {
  const h = new Date().getHours();
  let w = "晚上好";
  if (h >= 5 && h < 12) w = "上午好";
  else if (h >= 12 && h < 18) w = "下午好";
  const who =
    authStore.state.me?.displayName ||
    authStore.state.me?.username ||
    ownerName.value ||
    "朋友";
  return `${w}，${who}！`;
});

function tickClock() {
  const d = new Date();
  const wk = "日一二三四五六"[d.getDay()];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  clockText.value = `${yyyy}-${mm}-${dd} 周${wk} ${hh}:${mi}:${ss}`;
}

async function fetchWeather() {
  try {
    const r = await fetch("/api/climate", { cache: "no-cache" });
    const j = await r.json();
    if (!j.ok) {
      weatherText.value = j.error || "天气暂不可用";
      return;
    }
    const city = j.city ? String(j.city) : "";
    const info = j.info ? String(j.info) : "";
    const temp =
      j.temperature != null && String(j.temperature).trim() !== ""
        ? `${String(j.temperature)}℃`
        : "";
    const parts = [city, info, temp].filter(Boolean);
    weatherText.value = parts.length ? parts.join(" ") : "暂无实况";
  } catch {
    weatherText.value = "无法连接天气服务";
  }
}

async function loadSite() {
  try {
    const r = await fetch("/api/site", { cache: "no-cache" });
    if (r.ok) {
      const s = await r.json();
      ownerName.value = s.ownerDisplayName?.trim() || null;
    }
  } catch {
    /* 忽略 */
  }
}

function logout() {
  authStore.logout();
}

onMounted(() => {
  void loadSite();
  void authStore.fetchMe();
  tickClock();
  clockTimer = window.setInterval(tickClock, 1000);
  void fetchWeather();
  weatherTimer = window.setInterval(fetchWeather, 30 * 60 * 1000);
});

onUnmounted(() => {
  window.clearInterval(clockTimer);
  window.clearInterval(weatherTimer);
});

const bioText = computed(() => {
  const raw = authStore.state.me?.bio;
  if (!raw) return "";
  return String(raw).trim().replace(/\n+/g, " ");
});
</script>

<template>
  <header class="site-header">
    <div class="brand brand--home-meta">
      <a
        class="brand-avatar-link"
        href="/profile.html"
        data-nav-page="profile"
        aria-label="我的资料"
      >
        <span class="brand-avatar-slot" aria-hidden="true">
          <span
            v-if="authStore.loggedIn && authStore.state.me?.avatarUrl"
            class="user-avatar user-avatar--brand"
          >
            <img
              class="user-avatar__img"
              :src="authStore.state.me.avatarUrl"
              alt=""
            />
          </span>
          <span v-else class="user-avatar user-avatar--brand user-avatar--placeholder" />
        </span>
      </a>
      <div class="brand-main">
        <div class="brand-greeting-block">
          <router-link class="brand-text" to="/">
            <span id="brand-greeting">{{ greeting }}</span>
          </router-link>
          <p v-show="authStore.loggedIn && bioText" class="brand-bio">{{ bioText }}</p>
        </div>
        <div class="brand-meta" aria-live="polite">
          <time datetime="">{{ clockText }}</time>
          <span class="brand-meta__sep" aria-hidden="true">·</span>
          <span>{{ weatherText }}</span>
        </div>
      </div>
    </div>
    <nav class="nav site-nav" aria-label="主导航">
      <router-link to="/" data-nav-page="home" :aria-current="route.path === '/' ? 'page' : undefined">文章</router-link>
      <a v-show="authStore.loggedIn" href="/write.html" data-nav-page="write" data-nav-auth>写作</a>
      <a href="/博客说明.html" data-nav-page="docs">说明</a>
      <RouterLink v-show="!authStore.loggedIn" to="/login" data-nav-page="login" data-nav-guest>登录</RouterLink>
      <button v-show="authStore.loggedIn" type="button" class="nav-btn" @click="logout">退出</button>
    </nav>
  </header>
</template>
