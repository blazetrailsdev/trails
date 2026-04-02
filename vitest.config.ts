import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@blazetrails/activesupport": path.resolve(__dirname, "packages/activesupport/src/index.ts"),
      "@blazetrails/arel/src": path.resolve(__dirname, "packages/arel/src"),
      "@blazetrails/arel": path.resolve(__dirname, "packages/arel/src/index.ts"),
      "@blazetrails/activemodel": path.resolve(__dirname, "packages/activemodel/src/index.ts"),
      "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js": path.resolve(
        __dirname,
        "packages/activerecord/src/connection-adapters/sqlite3-adapter.ts",
      ),
      "@blazetrails/activerecord/adapters/postgresql-adapter.js": path.resolve(
        __dirname,
        "packages/activerecord/src/adapters/postgresql-adapter.ts",
      ),
      "@blazetrails/activerecord/adapters/mysql2-adapter.js": path.resolve(
        __dirname,
        "packages/activerecord/src/adapters/mysql2-adapter.ts",
      ),
      "@blazetrails/activerecord": path.resolve(__dirname, "packages/activerecord/src/index.ts"),
      "@blazetrails/rack": path.resolve(__dirname, "packages/rack/src/index.ts"),
      "@blazetrails/actionview": path.resolve(__dirname, "packages/actionview/src/index.ts"),
      "@blazetrails/actionpack": path.resolve(__dirname, "packages/actionpack/src/index.ts"),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/website/**"],
    setupFiles: process.env.MYSQL_TEST_URL
      ? ["./packages/activerecord/src/test-setup-mysql.ts"]
      : [],
  },
});
