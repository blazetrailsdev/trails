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
      // Disabled rules — enable one at a time and fix
      "@typescript-eslint/no-unused-vars": "off", // 7665 violations
      "@typescript-eslint/no-explicit-any": "off", // 4234 violations
      "@typescript-eslint/no-unused-expressions": "off", // 524 violations
      "@typescript-eslint/no-unsafe-function-type": "off", // 59 violations
      "@typescript-eslint/no-this-alias": "off", // 38 violations
      "no-undef": "off", // 570 violations
      "no-empty": "off", // 81 violations
      "no-cond-assign": "off", // 70 violations
      "no-useless-assignment": "off", // 40 violations
    },
  },
  // Arel package: all lint rules are resolved — enforce them to prevent regressions
  {
    files: ["packages/arel/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-this-alias": "error",
      "no-undef": "error",
      "no-empty": "error",
      "no-cond-assign": "error",
      "no-useless-assignment": "error",
    },
  },
);
