import { defineConfig } from "vitest/config";
import baseVitestConfig from "./vitest.config";

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
