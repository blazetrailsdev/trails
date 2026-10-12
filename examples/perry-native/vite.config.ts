/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "app",
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["test/**/*.test.ts"],
    exclude: ["test/{system,dummy,fixtures}/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
  publicDir: false,
  build: {
    outDir: "../public/assets",
    assetsDir: ".",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        application: fileURLToPath(
          new URL("app/assets/stylesheets/application.css", import.meta.url),
        ),
      },
    },
  },
});
