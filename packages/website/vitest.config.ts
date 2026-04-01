import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const aliases = {
  "@blazetrails/activesupport": path.resolve(__dirname, "../activesupport/src/index.ts"),
  "@blazetrails/arel/src": path.resolve(__dirname, "../arel/src"),
  "@blazetrails/arel": path.resolve(__dirname, "../arel/src/index.ts"),
  "@blazetrails/activemodel": path.resolve(__dirname, "../activemodel/src/index.ts"),
  "@blazetrails/activerecord": path.resolve(__dirname, "../activerecord/src/index.ts"),
  "@blazetrails/rack": path.resolve(__dirname, "../rack/src/index.ts"),
  "@blazetrails/actionpack": path.resolve(__dirname, "../actionpack/src/index.ts"),
  "@blazetrails/railties/generators": path.resolve(
    __dirname,
    "../railties/src/generators/index.ts",
  ),
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
          include: ["src/**/*.test.ts", "server/**/*.test.ts"],
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
