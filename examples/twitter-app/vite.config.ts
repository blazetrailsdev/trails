import { defineConfig } from "vite";
import { trailsPlugin } from "@blazetrails/trailties/vite";

export default defineConfig({
  plugins: [trailsPlugin()],
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
