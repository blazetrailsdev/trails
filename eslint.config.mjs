// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import vitest from "@vitest/eslint-plugin";
import noNodeBuiltins from "./eslint/no-node-builtins.mjs";
import noProcessBypass from "./eslint/no-process-bypass.mjs";
import railsPrivateJsdoc from "./eslint/rails-private-jsdoc.mjs";
import noNativeDate from "./eslint/no-native-date.mjs";

export default defineConfig(
  {
    ignores: [
      "vendor/**",
      "scripts/**",
      "**/dist/**",
      "packages/website/static/**",
      "packages/website/build/**",
      "packages/activerecord/src/type-virtualization/fixtures/**",
      "packages/activerecord/src/tsc-wrapper/__fixtures__/**",
    ],
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

  // ── no-node-builtins (browser compat) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      // Adapter implementations — these ARE the abstraction layer
      "packages/activesupport/src/fs-adapter.ts",
      "packages/activesupport/src/crypto-adapter.ts",
      "packages/activesupport/src/async-context-adapter.ts",
      "packages/activesupport/src/child-process-adapter.ts",
      "packages/activesupport/src/os-adapter.ts",
      // Node-only modules exposed via subpath imports (no browser equivalent)
      "packages/activerecord/src/tsc-wrapper/**",
      "packages/activesupport/src/gzip.ts",
      "packages/rack/src/deflater.ts",
      "packages/activerecord/src/encryption/config.ts",
      "packages/activerecord/src/encryption/context.ts",
      "packages/activerecord/src/connection-handling.ts",
    ],
    rules: {
      "blazetrails/no-node-builtins": "error",
    },
  },

  // ── blazetrails plugin (no-node-builtins + rails-private-jsdoc + no-native-date) ──
  // Registered without a `files` restriction so any block below can
  // reference its rules without re-declaring the plugin.
  {
    plugins: {
      blazetrails: {
        rules: {
          "no-node-builtins": noNodeBuiltins,
          "no-process-bypass": noProcessBypass,
          "rails-private-jsdoc": railsPrivateJsdoc,
          "no-native-date": noNativeDate,
        },
      },
    },
  },

  // ── no-process-bypass: forbid direct process.* in browser-target src ──
  // process.* must go through @blazetrails/activesupport/process-adapter
  // so these packages can run on browser/non-Node hosts. Test files are
  // always exempt (legit mocking/inspection of the host process).
  // Per-package exemptions noted inline.
  {
    files: [
      "packages/trailties/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/arel/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      // trailties: app-generator.ts contains template strings emitting
      // user-app code (which legitimately uses process.* at runtime in
      // the user's app).
      "packages/trailties/src/generators/app-generator.ts",
    ],
    rules: {
      "blazetrails/no-process-bypass": "error",
    },
  },

  // ── no-native-date (Temporal migration safety net) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/trailties/src/**/*.ts",
      "packages/website/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      "**/*.test-d.ts",
      // Temporal bridge — the canonical Date↔Instant adapter.
      "packages/activesupport/src/temporal.ts",
      // Test infrastructure: travelTo, fixture helpers, etc.
      "packages/activesupport/src/testing/**",
      "packages/activesupport/src/testing-helpers.ts",
    ],
    rules: {
      "blazetrails/no-native-date": "error",
    },
  },

  // ── rails-private-jsdoc (per-package rollout; widen as packages adopt) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-private-jsdoc": "error",
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
      "@typescript-eslint/no-namespace": "off",
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

  // ── actionpack + trailties ──
  {
    files: ["packages/actionpack/src/**/*.ts", "packages/trailties/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "unused-imports/no-unused-vars": "off",
      "no-undef": "off",
    },
  },

  // ── website ──
  {
    files: ["packages/website/src/**/*.ts", "packages/website/server/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-useless-assignment": "off",
      "no-undef": "off",
    },
  },
);
