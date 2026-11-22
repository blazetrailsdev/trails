import { fileURLToPath } from "node:url";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Builds app/javascript/application.js (which imports the stylesheet) to
// public/assets/application.{js,css}; the layouts link those paths directly.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    // Bundler.require imports the framework natively; load it the same way here so
    // the app and its engines share one copy of each package.
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
