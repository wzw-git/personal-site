import { h } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import PostView from "@/views/PostView.vue";
import { redirectToAdminLogin } from "@/utils/siteNavigate";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 直接访问 /index.html 时与 path: '/' 不一致，会导致主区域无路由、列表不出现
    { path: "/index.html", redirect: "/" },
    { path: "/", name: "home", component: HomeView },
    {
      path: "/post/:id",
      name: "post",
      component: PostView,
      props: true,
    },
    // 先进 SPA 再 replace 到 admin.html，规避部分浏览器对根路径静态页 + hash 的怪异行为
    {
      path: "/login",
      name: "login",
      beforeEnter() {
        return redirectToAdminLogin();
      },
      component: { render: () => h("span") },
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});
