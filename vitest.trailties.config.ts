import { defineConfig } from "vitest/config";
import baseVitestConfig from "./vitest.config";

// The root config's `other` project narrowed to packages/trailties, for CI's
// thor-only Trailties Tests step (`vitest related`). Related mode crawls the
// imports of every test file its projects include, and the root `other`
// project includes eslint/*.test.mjs, whose bare `eslint` import that crawl
// cannot resolve.
type Project = { test?: { name?: string; include?: string[] } };
const other = (baseVitestConfig.test?.projects as Project[]).find((p) => p.test?.name === "other")!;

export default defineConfig({
  ...baseVitestConfig,
  test: {
    ...baseVitestConfig.test,
    projects: [
      { ...other, test: { ...other.test, include: ["packages/trailties/src/**/*.test.ts"] } },
    ],
  },
});
