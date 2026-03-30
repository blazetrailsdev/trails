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
    languageOptions: {
      globals: {
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        process: "readonly",
        console: "readonly",
        performance: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Blob: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // ── activemodel ──
  {
    files: ["packages/activemodel/src/**/*.ts"],
    rules: {
      "unused-imports/no-unused-vars": "off",
    },
  },
  {
    files: ["packages/activemodel/src/**/*.test.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-disabled-tests": "off",
      "vitest/no-identical-title": "off",
      "vitest/expect-expect": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ── activerecord ──
  {
    files: ["packages/activerecord/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "unused-imports/no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
    },
  },

  // ── activesupport ──
  {
    files: ["packages/activesupport/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "unused-imports/no-unused-vars": "off",
      "no-empty": "off",
    },
  },
  {
    files: ["packages/activesupport/src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },

  // ── rack ──
  {
    files: ["packages/rack/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["packages/rack/src/common-logger.ts"],
    rules: {
      "no-control-regex": "off",
    },
  },

  // ── actionpack + railties ──
  {
    files: ["packages/actionpack/src/**/*.ts", "packages/railties/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "unused-imports/no-unused-vars": "off",
      "no-undef": "off",
    },
  },
);
