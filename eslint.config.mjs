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
);
