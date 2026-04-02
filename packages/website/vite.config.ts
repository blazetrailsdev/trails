import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pkgAlias(name: string, entry: string) {
  return {
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement: path.resolve(__dirname, entry),
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: [
      pkgAlias("@blazetrails/activesupport", "../activesupport/src/index.ts"),
      pkgAlias("@blazetrails/arel", "../arel/src/index.ts"),
      pkgAlias("@blazetrails/activemodel", "../activemodel/src/index.ts"),
      pkgAlias("@blazetrails/activerecord/adapter", "../activerecord/src/adapter.ts"),
      pkgAlias("@blazetrails/activerecord/migration", "../activerecord/src/migration.ts"),
      pkgAlias("@blazetrails/activerecord", "../activerecord/src/index.ts"),
      pkgAlias("@blazetrails/rack", "../rack/src/index.ts"),
      pkgAlias("@blazetrails/actionpack", "../actionpack/src/index.ts"),
      pkgAlias("@blazetrails/railties/generators", "../railties/src/generators/index.ts"),
    ],
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
