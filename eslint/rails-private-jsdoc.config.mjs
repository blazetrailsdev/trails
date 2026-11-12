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
  {
    ignores: [
      "packages/marcel/test/fixtures/**",
      "packages/mini-magick/test/fixtures/**",
      "packages/activestorage/test/fixtures/files/**",
      "packages/rack/test/cgi/assets/**",
    ],
  },
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
      "packages/arel/lib/**/*.ts",
      "packages/activesupport/lib/**/*.ts",
      "packages/activemodel/lib/**/*.ts",
      "packages/actionpack/lib/**/*.ts",
      "packages/actionview/lib/**/*.ts",
      "packages/actioncable/lib/**/*.ts",
      "packages/activejob/lib/**/*.ts",
      "packages/activerecord/{lib,test}/**/*.ts",
      "packages/rack/lib/**/*.ts",
      "packages/globalid/{lib,test}/**/*.ts",
      "packages/i18n/lib/**/*.ts",
      "packages/did-you-mean/lib/**/*.ts",
      "packages/bcrypt/lib/**/*.ts",
      "packages/trailties/lib/**/*.ts",
      "packages/thor/{lib,test}/**/*.ts",
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
      "packages/trailties/lib/**/*.ts",
      "packages/thor/{lib,test}/**/*.ts",
      "packages/activemodel/lib/**/*.ts",
      "packages/activesupport/lib/**/*.ts",
      "packages/globalid/{lib,test}/**/*.ts",
      "packages/i18n/lib/**/*.ts",
      "packages/activerecord/lib/**/*.ts",
      "packages/rack/lib/**/*.ts",
      "packages/did-you-mean/lib/**/*.ts",
      "packages/bcrypt/lib/**/*.ts",
      "packages/arel/lib/**/*.ts",
      "packages/actioncable/lib/**/*.ts",
      // Absent from the rails-private manifest by construction, so the
      // receipt pairing is mandatory package-wide there (RFC 0129).
      "packages/ruby-compat/{lib,test}/**/*.ts",
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
  // `crypto-adapter.ts`, `fs-adapter.ts` and the four small adapters beside
  // them are the platform backend contracts RFC 0135 moved in, not an
  // MRI primitive, so they have no `vendor/ruby/` line to cite. Its receipts are
  // written by hand; only the citation half is out of scope. This ignores list
  // must stay in sync with the `ruby-compat-needs-mri-citation` block in
  // eslint.config.mjs.
  {
    files: ["packages/ruby-compat/{lib,test}/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "packages/ruby-compat/lib/async-context-adapter.ts",
      "packages/ruby-compat/lib/child-process-adapter.ts",
      "packages/ruby-compat/lib/crypto-adapter.ts",
      "packages/ruby-compat/lib/fs-adapter.ts",
      "packages/ruby-compat/lib/http-adapter.ts",
      "packages/ruby-compat/lib/os-adapter.ts",
      "packages/ruby-compat/lib/process-adapter.ts",
      "packages/ruby-compat/lib/repl-adapter.ts",
      "packages/ruby-compat/lib/zlib-adapter.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "blazetrails/ruby-compat-needs-mri-citation": "error" },
  },
];
