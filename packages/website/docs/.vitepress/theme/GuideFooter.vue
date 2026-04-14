<script setup>
import { useData } from "vitepress";

const { page } = useData();
</script>

<template>
  <div v-if="page.relativePath.startsWith('guides/')" class="guide-license">
    <hr />
    <p>
      This guide is licensed under
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener noreferrer license"
        >CC BY 4.0</a
      >. Code examples are licensed under the
      <a
        href="https://github.com/blazetrailsdev/trails/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer license"
        >MIT License</a
      >.
    </p>
  </div>
</template>

<style>
.guide-license {
  margin-top: 3rem;
  font-size: 0.85em;
  color: var(--vp-c-text-2);
}
.guide-license hr {
  margin-bottom: 1rem;
  border-color: var(--vp-c-divider);
}
</style>
