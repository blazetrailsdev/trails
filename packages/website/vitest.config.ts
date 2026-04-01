import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@blazetrails/activesupport": path.resolve(__dirname, "../activesupport/src/index.ts"),
      "@blazetrails/arel/src": path.resolve(__dirname, "../arel/src"),
      "@blazetrails/arel": path.resolve(__dirname, "../arel/src/index.ts"),
      "@blazetrails/activemodel": path.resolve(__dirname, "../activemodel/src/index.ts"),
      "@blazetrails/activerecord": path.resolve(__dirname, "../activerecord/src/index.ts"),
      "@blazetrails/rack": path.resolve(__dirname, "../rack/src/index.ts"),
      "@blazetrails/actionpack": path.resolve(__dirname, "../actionpack/src/index.ts"),
      $frontiers: path.resolve(__dirname, "src/lib/frontiers"),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});
