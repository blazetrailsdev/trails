// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import vitest from "@vitest/eslint-plugin";
import noNodeBuiltins from "./eslint/no-node-builtins.mjs";
import noProcessBypass from "./eslint/no-process-bypass.mjs";
import railsPrivateJsdoc from "./eslint/rails-private-jsdoc.mjs";
import nieRequiresAnnotation from "./eslint/nie-requires-annotation.mjs";
import noNativeDate from "./eslint/no-native-date.mjs";
import sqliteDriverAwait from "./eslint/sqlite-driver-await.mjs";
import railsFileStructureMethodOrder from "./eslint/rails-file-structure-method-order.mjs";
import expectedFixtures from "./eslint/expected-fixtures.mjs";
import manifestComplete from "./eslint/manifest-complete.mjs";
import testFixtureParity from "./eslint/test-fixture-parity.mjs";
import useFixturesSchema from "./eslint/use-fixtures-schema.mjs";

export default defineConfig(
  {
    ignores: [
      "vendor/**",
      "scripts/**",
      "**/dist/**",
      "packages/website/static/**",
      "packages/website/build/**",
      "packages/activerecord/src/type-virtualization/fixtures/**",
      "packages/activerecord-cli/src/tsc-wrapper/__fixtures__/**",
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
      "packages/activerecord-cli/src/tsc-wrapper/**",
      "packages/activesupport/src/sqlite-drivers/node-sqlite.ts",
      "packages/activesupport/src/sqlite-drivers/expo-sqlite.ts",
      "packages/activesupport/src/gzip.ts",
      "packages/rack/src/deflater.ts",
      "packages/activerecord/src/encryption/config.ts",
      "packages/activerecord/src/encryption/context.ts",
      "packages/activerecord/src/connection-handling.ts",
      // MigrationProxy uses createRequire for synchronous file loading — Node-only
      "packages/activerecord/src/deprecator.ts",
      // Migrator.fromDir scans filesystem and uses pathToFileURL for ESM import — Node-only
      "packages/activerecord/src/migration.ts",
    ],
    rules: {
      "blazetrails/no-node-builtins": "error",
    },
  },

  // ── blazetrails plugin (no-node-builtins + no-process-bypass + rails-private-jsdoc + no-native-date + sqlite-driver-await) ──
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
          "sqlite-driver-await": sqliteDriverAwait,
          "nie-requires-annotation": nieRequiresAnnotation,
          "rails-file-structure-method-order": railsFileStructureMethodOrder,
          "expected-fixtures": expectedFixtures,
          "test-fixture-parity": testFixtureParity,
          "use-fixtures-schema": useFixturesSchema,
          // Off by default — opt in per project (see eslint/manifest-complete.mjs).
          "manifest-complete": manifestComplete,
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

  // ── rails-file-structure-method-order (per-package rollout) ──
  // Method-order slice of the rails-file-structure rule family
  // (docs/rails-file-structure-mirror-plan.md). Enforces that class
  // members + top-level functions match the Rails source order
  // documented in `eslint/rails-file-structure-method-order.json` (built
  // by `pnpm tsx scripts/build-rails-file-structure-manifest.ts`,
  // invoked by `pnpm api:compare`). Autofixable.
  {
    files: ["packages/arel/src/**/*.ts", "packages/activemodel/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-file-structure-method-order": "error",
    },
  },

  // ── nie-requires-annotation: every `throw new NotImplementedError` must
  // carry a `// @nie disposition=…` comment. Tracks the elimination
  // initiative (docs/activerecord-100-clusters.md).
  {
    files: [
      "packages/activerecord/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/arel/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/nie-requires-annotation": "error",
    },
  },

  // ── expected-fixtures: activerecord test files must load Rails-declared
  //    fixture sets via useFixtures({...}). Files currently lacking it are
  //    tracked in eslint/expected-fixtures-exclude.json and ratcheted down
  //    as porters migrate. See eslint/expected-fixtures.mjs. ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    rules: {
      "blazetrails/expected-fixtures": "error",
    },
  },

  // ── test-fixture-parity: notice-only warn when a trails test whose Rails
  //    counterpart uses fixtures lacks a useFixtures call in its describe scope.
  //    Mapping: eslint/test-fixture-parity.json (committed). ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    rules: {
      "blazetrails/test-fixture-parity": "warn",
    },
  },
  {
    // Exclude test-helpers/ — those tests exercise useFixtures itself and
    // intentionally omit { schema } as part of the infrastructure test surface.
    files: ["packages/activerecord/src/**/*.test.ts"],
    ignores: ["packages/activerecord/src/test-helpers/**"],
    rules: {
      "blazetrails/use-fixtures-schema": "warn",
    },
  },

  // ── sqlite-driver-await: driver call sites must be awaited ──
  {
    files: [
      "packages/activerecord/src/connection-adapters/sqlite3/**/*.ts",
      "packages/activerecord/src/connection-adapters/sqlite3-adapter.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/sqlite-driver-await": "error",
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
      "@typescript-eslint/no-this-alias": "off",
      "unused-imports/no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
    },
  },

  // ── no conditionals in tests (all packages except activerecord) ──
  {
    files: [
      "packages/*/src/**/*.test.ts",
      "packages/*/dx-tests/**/*.test.ts",
      "packages/*/virtualized-dx-tests/**/*.test.ts",
    ],
    ignores: ["packages/activerecord/**"],
    plugins: { vitest },
    rules: {
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-tests": "error",
    },
  },

  // ── activerecord: no-conditional-tests and no-conditional-in-test are
  // clean. no-conditional-expect still has outstanding violations; enable
  // it in a follow-up PR as the sites are driven to zero.
  {
    files: [
      "packages/activerecord/src/**/*.test.ts",
      "packages/activerecord/dx-tests/**/*.test.ts",
      "packages/activerecord/virtualized-dx-tests/**/*.test.ts",
    ],
    plugins: { vitest },
    rules: {
      "vitest/no-conditional-tests": "error",
      "vitest/no-conditional-in-test": "error",
    },
  },

  // ── activesupport ──
  {
    files: ["packages/activesupport/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
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
