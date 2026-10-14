import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { packageEntries, resolveEntries } from "./aliases.js";

function pkgAlias(name: string, replacement: string) {
  return {
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement,
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: resolveEntries(packageEntries).map(([name, entry]) => pkgAlias(name, entry)),
  },
  build: {
    rollupOptions: {
      external: (id: string) =>
        id.startsWith("node:") ||
        id.startsWith("@blazetrails/activesupport/") ||
        [
          "fs",
          "path",
          "crypto",
          "url",
          "zlib",
          "child_process",
          "util",
          "events",
          "stream",
          "net",
          "tls",
          "dns",
        ].includes(id),
    },
  },
});
