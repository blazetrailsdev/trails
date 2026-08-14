import { defineConfig } from "vite";

export default defineConfig({
  root: "src/app/assets",
  base: "/assets/",
  publicDir: "../../../public",
  build: {
    outDir: "../../../public/assets",
    manifest: true,
    rollupOptions: {
      input: {
        application: "stylesheets/application.css",
      },
    },
  },
});
