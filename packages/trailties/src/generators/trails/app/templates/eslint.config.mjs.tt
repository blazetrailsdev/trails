// Recommended JavaScript and TypeScript styling for trails
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: [".trails/", "dist/", "log/", "node_modules/", "public/assets/", "storage/", "tmp/"] },
  js.configs.recommended,
  tseslint.configs.recommended,

  // Overwrite or add rules to create your own house style
  //
  // // Allow `let` for bindings that are never reassigned
  // { rules: { "prefer-const": "off" } },
]);
