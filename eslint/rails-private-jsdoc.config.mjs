/**
 * Standalone flat config that enables ONLY `blazetrails/rails-private-jsdoc`.
 *
 * The rule needs `eslint/rails-private-methods.json`, which is built from
 * `scripts/api-compare/output/rails-api.json` and therefore only exists in the
 * `rails-comparison` CI job (the one with Ruby). Reusing the root
 * `eslint.config.mjs` there would re-run the entire ruleset over six packages —
 * a full duplicate of the standalone Lint job, and unrelated violations would
 * fail the wrong job. This config keeps that step to the one rule the manifest
 * unlocks.
 *
 * The `files` list must stay in sync with the `rails-private-jsdoc` block in
 * eslint.config.mjs; that block is what governs every other invocation.
 */
import tseslint from "typescript-eslint";
import railsPrivateJsdoc from "./rails-private-jsdoc.mjs";
import unbackedInternalNeedsReceipt from "./unbacked-internal-needs-receipt.mjs";

export default [
  // Plugin registration is global (no `files`): ESLint refuses to redefine a
  // plugin, so the two rule blocks below cannot each declare it.
  {
    plugins: {
      blazetrails: {
        rules: {
          "rails-private-jsdoc": railsPrivateJsdoc,
          "unbacked-internal-needs-receipt": unbackedInternalNeedsReceipt,
        },
      },
    },
  },
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/globalid/src/**/*.ts",
      "packages/i18n/src/**/*.ts",
      "packages/did-you-mean/src/**/*.ts",
      "packages/trailties/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    // Run with `--no-inline-config`: the sources carry `eslint-disable`
    // comments for rules this config does not register, and each of those
    // would otherwise be a "Definition for rule ... was not found" error.
    // Nothing disables `rails-private-jsdoc` inline, so ignoring inline config
    // costs no legitimate suppression.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "blazetrails/rails-private-jsdoc": "error" },
  },
  // The reverse direction (RFC 0121), enrolled per package and ONLY-GROW.
  // Keep this `files` list in sync with the `unbacked-internal-needs-receipt`
  // block in eslint.config.mjs.
  {
    files: [
      "packages/trailties/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/globalid/src/**/*.ts",
      "packages/i18n/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/did-you-mean/src/**/*.ts",
    ],
    // test-helpers/ mirrors Rails' test/ code, which the Ruby extractor never
    // reads, so the manifest cannot back an `@internal` there by construction
    // and `parity:api:extra` holds the tree out of scoring entirely.
    ignores: ["**/*.test.ts", "**/test-helpers/**"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "blazetrails/unbacked-internal-needs-receipt": "error" },
  },
];
