import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { fileURLToPath } from "url";
import { packageEntries, resolveEntries, subpathPrefixes } from "./aliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const aliases: Record<string, string> = {
  ...Object.fromEntries(resolveEntries(subpathPrefixes)),
  ...Object.fromEntries(resolveEntries(packageEntries)),
  $frontiers: path.resolve(__dirname, "src/lib/frontiers"),
};

const sqlJsWasmPath = path.resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.js");

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "server/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["src/lib/frontiers/components/**/*.test.ts"],
        },
        resolve: { alias: aliases },
      },
      {
        plugins: [svelte({ hot: false })],
        resolve: {
          alias: { ...aliases, "sql.js": sqlJsWasmPath },
          conditions: ["browser"],
        },
        test: {
          name: "components",
          include: ["src/lib/frontiers/components/**/*.test.ts"],
          environment: "jsdom",
        },
      },
    ],
  },
});
