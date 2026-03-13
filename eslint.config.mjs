// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["vendor/**", "scripts/**", "**/dist/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Enable with underscore-prefix ignore pattern for intentionally unused params
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Per-package overrides for rules that still have violations
  {
    files: [
      "packages/activerecord/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/cli/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off",
    },
  },
  {
    files: [
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: [
      "packages/activesupport/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    files: [
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  {
    files: ["packages/rack/src/**/*.ts"],
    rules: {
      "no-useless-assignment": "off",
    },
  },
);
