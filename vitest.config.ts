import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@rails-ts/activesupport": path.resolve(__dirname, "packages/activesupport/src/index.ts"),
      "@rails-ts/arel/src": path.resolve(__dirname, "packages/arel/src"),
      "@rails-ts/arel": path.resolve(__dirname, "packages/arel/src/index.ts"),
      "@rails-ts/activemodel": path.resolve(
        __dirname,
        "packages/activemodel/src/index.ts"
      ),
      "@rails-ts/activerecord": path.resolve(
        __dirname,
        "packages/activerecord/src/index.ts"
      ),
      "@rails-ts/rack": path.resolve(
        __dirname,
        "packages/rack/src/index.ts"
      ),
      "@rails-ts/actionpack": path.resolve(
        __dirname,
        "packages/actionpack/src/index.ts"
      ),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
