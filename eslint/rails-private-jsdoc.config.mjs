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

export default [
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
    plugins: { blazetrails: { rules: { "rails-private-jsdoc": railsPrivateJsdoc } } },
    rules: { "blazetrails/rails-private-jsdoc": "error" },
  },
];
