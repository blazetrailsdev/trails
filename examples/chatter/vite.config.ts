import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds app/javascript/application.js (which imports the stylesheet) to
// public/assets/application.{js,css}; the layouts link those paths directly.
export default defineConfig({
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
