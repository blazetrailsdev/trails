import { defineConfig } from "vitest/config";
import { packageEntries, resolveEntries, subpathPrefixes } from "./aliases.js";

const aliases: Record<string, string> = {
  ...Object.fromEntries(resolveEntries(subpathPrefixes)),
  ...Object.fromEntries(resolveEntries(packageEntries)),
};

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "server/**/*.test.ts", "scripts/**/*.test.ts"],
        },
        resolve: { alias: aliases },
      },
    ],
  },
});
