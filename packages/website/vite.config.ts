import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { packageEntries, resolveEntries } from "./aliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pkgAlias(name: string, replacement: string) {
  return {
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement,
  };
}

function stubPsychAdapter() {
  return {
    name: "stub-psych-adapter",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      if (
        source === "@blazetrails/ruby-compat/psych-adapter" ||
        (source.endsWith("/psych-adapter.js") && importer?.includes("/ruby-compat/"))
      ) {
        return path.resolve(__dirname, "src/stubs/yaml-stub.ts");
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [stubPsychAdapter(), tailwindcss(), sveltekit()],
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
