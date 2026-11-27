import { fileURLToPath } from "node:url";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    root: path("."),
    include: process.env.TRAILS_SYSTEM_TESTS
      ? ["test/system/**/*.system.test.ts"]
      : ["test/**/*.test.ts"],
    exclude: process.env.TRAILS_SYSTEM_TESTS ? [] : ["test/system/**"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: process.env.TRAILS_SYSTEM_TESTS ? 60_000 : undefined,
    server: { deps: { external: [/\/packages\//] } },
  },
  publicDir: false,
  resolve: {
    alias: [
      { find: /^actions$/, replacement: path("app/javascript/actions/index.js") },
      { find: /^controllers$/, replacement: path("app/javascript/controllers/index.js") },
      {
        find: /^(actions|controllers|helpers)\/(.*)$/,
        replacement: path("app/javascript/") + "$1/$2.js",
      },
      { find: /^house$/, replacement: path("vendor/javascript/house.min.js") },
      { find: /^@rails\/request\.js$/, replacement: path("vendor/javascript/@rails--request.js") },
    ],
  },
  build: {
    outDir: "public/assets",
    assetsDir: ".",
    emptyOutDir: false,
    rollupOptions: {
      input: { application: path("app/javascript/application.js") },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
