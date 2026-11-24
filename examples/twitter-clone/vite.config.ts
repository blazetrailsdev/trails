/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["test/**/*.test.ts"],
    exclude: ["test/{system,dummy,fixtures}/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    // Bundler.require imports the framework natively; load it the same way here so
    // the app and the tests share one copy of each package.
    server: { deps: { external: [/\/packages\//] } },
  },
});
