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
import rubyCompatNeedsMriCitation from "./ruby-compat-needs-mri-citation.mjs";

export default [
  // Plugin registration is global (no `files`): ESLint refuses to redefine a
  // plugin, so the two rule blocks below cannot each declare it.
  {
    plugins: {
      blazetrails: {
        rules: {
          "rails-private-jsdoc": railsPrivateJsdoc,
          "unbacked-internal-needs-receipt": unbackedInternalNeedsReceipt,
          "ruby-compat-needs-mri-citation": rubyCompatNeedsMriCitation,
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
      "packages/arel/src/**/*.ts",
      // Absent from the rails-private manifest by construction, so the
      // receipt pairing is mandatory package-wide there (RFC 0129).
      "packages/ruby-compat/src/**/*.ts",
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
  // ruby-compat's MRI citations RESOLVE against `vendor/ruby/`, and this is the
  // one CI job that fetches it — the standalone Lint job has none, where the
  // rule skips by design. So this block is the enforcing run, the same way the
  // manifest-backed rules above only go live here.
  // `fs-adapter.ts` is the platform backend contract RFC 0135 moved in, not an
  // MRI primitive, so it has no `vendor/ruby/` line to cite. Its receipts are
  // written by hand; only the citation half is out of scope. This ignores list
  // must stay in sync with the `ruby-compat-needs-mri-citation` block in
  // eslint.config.mjs.
  {
    files: ["packages/ruby-compat/src/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "packages/ruby-compat/src/fs-adapter.ts",
      "packages/ruby-compat/src/process-adapter.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "blazetrails/ruby-compat-needs-mri-citation": "error" },
  },
];
