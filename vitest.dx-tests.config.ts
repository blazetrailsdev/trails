import { defineConfig } from "vitest/config";
import baseVitestConfig from "./vitest.config";

// Separate config for DX type tests. These are type-level assertions — no
// runtime code runs. Vitest's typecheck mode compiles each *.test-d.ts and
// reports any type errors as test failures.
//
// Aliases are reused from the root runtime config so additions don't have to
// be kept in sync across two files.
const alias =
  (baseVitestConfig as { resolve?: { alias?: Record<string, string> } }).resolve?.alias ?? {};

export default defineConfig({
  resolve: { alias },
  test: {
    include: [],
    projects: [
      {
        extends: true,
        test: {
          name: "activerecord",
          typecheck: {
            enabled: true,
            only: true,
            include: ["packages/activerecord/dx-tests/**/*.test-d.ts"],
            tsconfig: "./packages/activerecord/dx-tests/tsconfig.json",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "trailties",
          typecheck: {
            enabled: true,
            only: true,
            include: ["packages/trailties/dx-tests/**/*.test-d.ts"],
            tsconfig: "./packages/trailties/dx-tests/tsconfig.json",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "actionview",
          typecheck: {
            enabled: true,
            only: true,
            include: ["packages/actionview/dx-tests/**/*.test-d.ts"],
            tsconfig: "./packages/actionview/dx-tests/tsconfig.json",
          },
        },
      },
    ],
  },
});
