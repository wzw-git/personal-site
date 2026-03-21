<script setup>
import { onMounted } from "vue";
import SiteHeader from "@/components/SiteHeader.vue";
import { authStore } from "@/stores/auth";

onMounted(() => {
  void authStore.fetchMe();
});
</script>

<template>
  <div class="bg" aria-hidden="true" />
  <div class="wrap">
    <SiteHeader />
    <router-view />
  </div>
</template>
