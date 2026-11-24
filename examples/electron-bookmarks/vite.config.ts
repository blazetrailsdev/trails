import { fileURLToPath } from "node:url";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    server: { deps: { external: [/\/packages\//] } },
  },
  publicDir: false,
  build: {
    outDir: "public/assets",
    assetsDir: ".",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        application: fileURLToPath(new URL("app/javascript/application.js", import.meta.url)),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
