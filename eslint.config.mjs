// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import vitest from "@vitest/eslint-plugin";

export default defineConfig(
  {
    ignores: ["vendor/**", "scripts/**", "**/dist/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Enable with underscore-prefix ignore pattern for intentionally unused params
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Auto-fixable unused imports
      "unused-imports/no-unused-imports": "error",
    },
  },
  // Vitest-specific rules for activemodel test files only (other packages have too many violations)
  {
    files: ["packages/activemodel/src/**/*.test.ts"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-disabled-tests": "off",
      "vitest/no-identical-title": "off",
      "vitest/expect-expect": "off",
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
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off",
      "unused-imports/no-unused-imports": "off",
    },
  },
  {
    files: ["packages/activemodel/src/**/*.ts"],
    languageOptions: {
      globals: {
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["packages/activesupport/src/**/*.ts", "packages/rack/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["packages/activesupport/src/**/*.ts", "packages/activerecord/src/**/*.ts"],
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
