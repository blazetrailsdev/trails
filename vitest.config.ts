import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@blazetrails/activesupport": path.resolve(__dirname, "packages/activesupport/src/index.ts"),
      "@blazetrails/arel/src": path.resolve(__dirname, "packages/arel/src"),
      "@blazetrails/arel": path.resolve(__dirname, "packages/arel/src/index.ts"),
      "@blazetrails/activemodel": path.resolve(__dirname, "packages/activemodel/src/index.ts"),
      "@blazetrails/activerecord": path.resolve(__dirname, "packages/activerecord/src/index.ts"),
      "@blazetrails/rack": path.resolve(__dirname, "packages/rack/src/index.ts"),
      "@blazetrails/actionpack": path.resolve(__dirname, "packages/actionpack/src/index.ts"),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
