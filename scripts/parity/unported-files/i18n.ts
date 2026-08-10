/**
 * Entries scoped to `package: "i18n"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const I18N_UNPORTED_FILES: UnportedFile[] = [
  // --- i18n: optional backend mixins composed on top of Simple ---
  {
    pattern: "backend/cache.rb",
    testFile: "backend/cache_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — caches lookups through ActiveSupport::Cache.",
  },
  {
    pattern: "backend/cache_file.rb",
    testFile: "backend/cache_file_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — caches parsed translation files on disk.",
  },
  {
    pattern: "backend/cascade.rb",
    testFile: "backend/cascade_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — cascading key lookup (`foo.bar.baz` → `foo.baz`).",
  },
  {
    pattern: "backend/interpolation_compiler.rb",
    testFile: "backend/interpolation_compiler_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — compiles interpolations into Ruby " +
      "procs via `eval`/`instance_eval`, which has no trails counterpart.",
  },
  {
    pattern: "backend/lazy_loadable.rb",
    testFile: "backend/lazy_loadable_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — defers translation-file loading until first lookup.",
  },
  {
    pattern: "backend/memoize.rb",
    testFile: "backend/memoize_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — memoizes lookups per locale.",
  },
  {
    pattern: "backend/metadata.rb",
    testFile: "backend/metadata_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — attaches lookup metadata onto the " +
      "translated String's singleton class. JS strings take no per-instance state.",
  },
  {
    pattern: "backend/pluralization.rb",
    testFile: "backend/pluralization_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — pluralization via per-locale rule procs in the data.",
  },
  {
    testFile: "backend/pluralization_fallback_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — pluralization via per-locale rule procs in the data. " +
      "Suite for the deferred `backend/pluralization.rb` composed with Fallbacks.",
  },
  {
    testFile: "backend/pluralization_scope_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — pluralization via per-locale rule procs in the data. " +
      "Suite for the deferred `backend/pluralization.rb` looked up under a scope.",
  },
  // --- i18n: api/ suites that install a deferred backend ---
  {
    testFile: "api/all_features_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixins — a Chain of every deferred mixin " +
      "(Cascade, Memoize, Metadata, Pluralization, Fallbacks) at once.",
  },
  {
    testFile: "api/cascade_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — cascading key lookup (`foo.bar.baz` → `foo.baz`).",
  },
  {
    testFile: "api/lazy_loadable_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — defers translation-file loading until first lookup.",
  },
  {
    testFile: "api/memoize_test.rb",
    package: "i18n",
    reason: "Pre-1.0: optional backend mixin — memoizes lookups per locale.",
  },
  {
    testFile: "api/pluralization_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: optional backend mixin — pluralization via per-locale rule procs in the data.",
  },
  // --- i18n: gem surface trails has no counterpart for ---
  {
    // Deliberately broad: covers `gettext.rb`, `gettext/*` and the
    // `backend/gettext.rb` mixin in one entry.
    pattern: "gettext",
    testFile: "gettext/",
    package: "i18n",
    reason:
      "Pre-1.0: gettext .po support — the catalogue parser, the `_`/`n_`/`s_` " +
      "helpers, and the backend mixin that loads .po files. A Ruby toolchain " +
      "concern with no trails consumer; Rails' own I18n usage never touches it.",
  },
  {
    testFile: "gettext_plural_keys_test.rb",
    package: "i18n",
    reason:
      "Pre-1.0: gettext .po support — exercises `I18n::Gettext.plural_keys`. " +
      "Sits at test/i18n/, outside the `gettext/` prefix above.",
  },
  {
    pattern: "middleware.rb",
    testFile: "i18n/middleware_test.rb",
    package: "i18n",
    reason:
      "Rack middleware that resets `I18n.locale` after each request. trails " +
      "has no Rack request lifecycle wiring for i18n yet; resetting is done " +
      "explicitly by callers.",
  },
  {
    pattern: "tests/",
    package: "i18n",
    reason:
      "`lib/i18n/tests/*` are minitest mixins the gem ships so third-party " +
      "backends can run its conformance suite. Test-support scaffolding, not " +
      "library surface — trails' backend tests are vitest files instead.",
  },
  {
    pattern: "tests.rb",
    package: "i18n",
    reason:
      "Pre-1.0: the `I18n::Tests` namespace's autoload shim for the `tests/` " +
      "conformance mixins excluded above — a file that sits beside the " +
      "directory the pattern above reaches.",
  },
];
