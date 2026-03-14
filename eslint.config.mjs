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
      // Use unused-imports plugin for imports (auto-fixable) and vars
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Disable the built-in rule to avoid duplicate reports
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Vitest + activemodel test file overrides
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
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Per-package overrides for rules that still have violations
  {
    files: [
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/cli/src/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off",
      "unused-imports/no-unused-imports": "off",
      "unused-imports/no-unused-vars": "off",
    },
  },
  {
    files: ["packages/activerecord/src/**/*.ts"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        setTimeout: "readonly",
        process: "readonly",
        console: "readonly",
        btoa: "readonly",
        atob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "unused-imports/no-unused-vars": "off",
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
      "unused-imports/no-unused-vars": "off",
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
