/**
 * Entries scoped to `package: "activesupport"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const ACTIVESUPPORT_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "i18n_railtie.rb",
    package: "activesupport",
    reason:
      "Rails boot lifecycle hook that wires I18n into the Railtie/Application init sequence. " +
      "No JS equivalent — I18n is configured directly in user code.",
  },
  {
    pattern: "testing/error_reporter_assertions.rb",
    package: "activesupport",
    reason:
      "Minitest assertion module (`assert_error_reported`) for Rails' own test suite; " +
      "trails has no port, and its `subscribe`/`record`/`report` names otherwise cluster " +
      "onto the unrelated `error-reporter.ts`.",
  },
  // The activesupport `core_ext/*` tail with no trails counterpart (RFC 0072).
  {
    pattern: "core_ext/module/attribute_accessors_per_thread.rb",
    package: "activesupport",
    reason: "Stores the value per `Thread.current`; JS has no thread-local storage.",
  },
  {
    pattern: "core_ext/module/remove_method.rb",
    package: "activesupport",
    reason: "Method-table surgery to silence redefinition warnings; JS reassignment is silent.",
  },
  {
    pattern: "starts_ends_with.rb",
    package: "activesupport",
    reason: "Aliases `start_with?`/`end_with?` for Symbol and String; both are native JS.",
  },
  {
    pattern: "core_ext/string/multibyte.rb",
    package: "activesupport",
    reason:
      "`mb_chars` returns a Multibyte::Chars proxy and `is_utf8?` reports a Ruby Encoding; " +
      "JS strings carry no encoding tag and are already Unicode.",
  },
  {
    pattern: "core_ext/kernel/singleton_class.rb",
    package: "activesupport",
    reason:
      "Ruby metaprogramming with no JS equivalent; trails assigns to the class object directly.",
  },
  {
    pattern: "core_ext/pathname/existence.rb",
    package: "activesupport",
    reason:
      "Ruby's Pathname is not ported (trails paths are strings) and the check is async in JS.",
  },
  {
    pattern: "core_ext/regexp.rb",
    package: "activesupport",
    reason: "Reads the `//m` bit out of Ruby's options bitmask; JS `RegExp` exposes `.multiline`.",
  },
  {
    pattern: "core_ext/integer/multiple.rb",
    package: "activesupport",
    reason: "Pre-1.0: `Integer#multiple_of?` is unported and has no trails caller.",
  },
  {
    pattern: "core_ext/module/deprecation.rb",
    package: "activesupport",
    reason:
      "Pre-1.0: class-body sugar over `Deprecation#deprecate_methods`; trails calls the " +
      "deprecator directly (`deprecation.ts#deprecateMethod`).",
  },
  {
    pattern: "core_ext/object/with_options.rb",
    package: "activesupport",
    reason: "Pre-1.0: needs ActiveSupport::OptionMerger, not ported yet (RFC 0093).",
  },
  {
    pattern: "core_ext/string/behavior.rb",
    package: "activesupport",
    reason: "Pre-1.0: one arm of `acts_like?`; trails ports the Time/Date arms only.",
  },
  // Out-of-closure activesupport families (RFC 0072). trails' scope for the
  // support gems is the `require "active_support/…"` closure of
  // activerecord/lib + activemodel/lib — the set `scripts/api-compare/ar-closure.ts`
  // walks out of vendor/rails and prints as the "AR closure" rollup. Every file
  // below sits OUTSIDE that closure and has no trails counterpart, so it is
  // denominator-only. Files that are out of closure but partially ported
  // (`cache.rb`, `cache/file_store.rb`, `cache/memory_store.rb`,
  // `cache/null_store.rb`, `xml_mini.rb`, `xml_mini/nokogiri*.rb`) stay counted,
  // as do in-closure files the walk reaches (`concurrency/share_lock.rb`,
  // `dependencies/interlock.rb`, `testing/parallelization*.rb`) and
  // `log_subscriber/test_helper.rb`, which AR's own log_subscriber and enum
  // tests include.
  {
    pattern: "cache/redis_cache_store.rb",
    testFile: "redis_cache_store_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "cache/mem_cache_store.rb",
    testFile: "mem_cache_store_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "cache/strategy/local_cache.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "cache/strategy/local_cache_middleware.rb",
    testFile: "local_cache_middleware_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "reloader.rb",
    testFile: "reloader_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "execution_wrapper.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "/file_update_checker.rb",
    testFile: "/file_update_checker_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "evented_file_update_checker.rb",
    testFile: "evented_file_update_checker_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "xml_mini/jdom.rb",
    testFile: "jdom_engine_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "xml_mini/libxml.rb",
    testFile: "libxml_engine_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "xml_mini/libxmlsax.rb",
    testFile: "libxmlsax_engine_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "testing/parallelize_executor.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "encrypted_configuration.rb",
    testFile: "encrypted_configuration_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "code_generator.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "fork_tracker.rb",
    testFile: "fork_tracker_test.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "/railtie.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
  {
    pattern: "syntax_error_proxy.rb",
    package: "activesupport",
    reason:
      "outside the AR/AM require closure; deferred until an actionpack/railties port needs it.",
  },
];
