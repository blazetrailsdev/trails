/**
 * Entries scoped to `package: "activesupport"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const SOLID_STACK_ONLY =
  "PERMANENT: trails targets the Solid stack (Solid Cache/Queue/Cable); memcached and Redis backends are deferred by owner ruling (2026-10-17).";

export const ACTIVESUPPORT_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "i18n_railtie.rb",
    package: "activesupport",
    reason: "CONVERGEABLE activesupport-port-i18n-railtie",
  },
  // The activesupport `core_ext/*` tail with no trails counterpart (RFC 0072).
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
    testFile: "redis_cache_store_test.rb",
    package: "activesupport",
    reason: "CONVERGEABLE port-redis-cache-store-test",
  },
  {
    pattern: "cache/mem_cache_store.rb",
    testFile: "mem_cache_store_test.rb",
    package: "activesupport",
    reason: SOLID_STACK_ONLY,
  },
  {
    pattern: "evented_file_update_checker.rb",
    testFile: "evented_file_update_checker_test.rb",
    package: "activesupport",
    reason: "CONVERGEABLE activesupport-port-evented-file-update-checker",
  },
  {
    pattern: "xml_mini/jdom.rb",
    testFile: "jdom_engine_test.rb",
    package: "activesupport",
    reason: "PERMANENT: JRuby-only; it drives Java's javax.xml DOM, which has no Node runtime.",
  },
  {
    pattern: "xml_mini/libxml.rb",
    testFile: "libxml_engine_test.rb",
    package: "activesupport",
    reason: "CONVERGEABLE activesupport-port-xml-mini-libxml-engines",
  },
  {
    pattern: "xml_mini/libxmlsax.rb",
    testFile: "libxmlsax_engine_test.rb",
    package: "activesupport",
    reason: "CONVERGEABLE activesupport-port-xml-mini-libxml-engines",
  },
  {
    pattern: "testing/parallelization.rb",
    package: "activesupport",
    reason:
      'PERMANENT: forks worker processes and talks to them over DRb; vitest owns worker scheduling — CLAUDE.md \u00a7 "Runtime facts Node does not expose", the `fork` bullet (RFC 0246 Open question 2, ruled by the operator on 2026-11-19).',
  },
  {
    pattern: "testing/parallelization/server.rb",
    package: "activesupport",
    reason:
      'PERMANENT: forks worker processes and talks to them over DRb; vitest owns worker scheduling — CLAUDE.md \u00a7 "Runtime facts Node does not expose", the `fork` bullet (RFC 0246 Open question 2, ruled by the operator on 2026-11-19).',
  },
  {
    pattern: "testing/parallelization/worker.rb",
    package: "activesupport",
    reason:
      'PERMANENT: forks worker processes and talks to them over DRb; vitest owns worker scheduling — CLAUDE.md \u00a7 "Runtime facts Node does not expose", the `fork` bullet (RFC 0246 Open question 2, ruled by the operator on 2026-11-19).',
  },
  {
    pattern: "testing/parallelize_executor.rb",
    package: "activesupport",
    reason:
      'PERMANENT: exists only to drive the `Parallelization` worker pool or a thread pool for Minitest; vitest owns worker scheduling — CLAUDE.md \u00a7 "Runtime facts Node does not expose", the `fork` bullet (RFC 0246 Open question 2, ruled by the operator on 2026-11-19).',
  },
  {
    pattern: "/railtie.rb",
    package: "activesupport",
    reason: "CONVERGEABLE activesupport-port-railtie",
  },

  // ---------------------------------------------------------------------------
  // Case-level exclusions from the AR-closure skip-stub triage (RFC 0105,
  // `triage-activesupport-in-closure-skip-stubs`). Every row below names the
  // Ruby-only mechanism the case is written on — Thread/Fiber, Psych, Marshal,
  // Ruby Encoding, Ruby constant/singleton-class metaprogramming, GC, or a
  // child process. Their sibling cases in the same file stay counted and are
  // owned by the RFC 0105 porting stories.
  // ---------------------------------------------------------------------------
  {
    testFile: "cache/cache_store_setting_test.rb",
    tests: [
      "mem cache fragment cache store",
      "mem cache fragment cache store with not dalli client",
      "mem cache fragment cache store with multiple servers",
      "mem cache fragment cache store with options",
    ],
    reason: SOLID_STACK_ONLY,
  },
  {
    testFile: "share_lock_test.rb",
    tests: ["killed thread loses lock"],
    reason:
      "Asserts that `Thread#kill` unwinds a thread holding a share so its `ensure` " +
      "releases the lock. ruby-compat's Thread#kill cannot unwind a JS body awaiting a " +
      "promise, so the killed thread's share is never released.",
  },
  {
    pattern: "dependencies/require_dependency.rb",
    testFile: "dependencies_test.rb",
    package: "activesupport",
    reason:
      'PERMANENT: CLAUDE.md, "`Module#autoload` is a build step" and "The application loader is Zeitwerk".',
  },
  {
    testFile: "transliterate_test.rb",
    tests: [
      "transliterate handles strings with valid gb18030 encodings",
      "transliterate handles strings with incompatible encodings",
      "transliterate handles strings with invalid utf8 bytes",
      "transliterate handles strings with invalid us ascii bytes",
      "transliterate handles strings with invalid gb18030 bytes",
    ],
    reason:
      "Each case builds a String in a non-UTF-8 Ruby Encoding (`force_encoding`, " +
      "`\\xC3\\x28`) and asserts `transliterate`'s `Encoding::CompatibilityError` / " +
      "replacement-character behaviour (inflector/transliterate.rb:64-90). A JS string carries no " +
      "encoding tag and cannot hold an invalid byte sequence, so neither the input nor " +
      "the error can be constructed.",
  },
  {
    testFile: "concurrency/load_interlock_aware_monitor_test.rb",
    tests: ["entering with no blocking", "entering with blocking", "lock owned by thread"],
    reason:
      "LoadInterlockAwareMonitor#synchronize hands the GVL back to the autoload interlock " +
      "while a second `Thread` contends for the monitor " +
      "(concurrency/load_interlock_aware_monitor.rb:8-25). The cases assert that hand-off from a " +
      "spawned thread; JS is single-threaded and has no monitor to contend for.",
  },
  {
    testFile: "attribute_accessor_per_thread_test.rb",
    tests: [
      "is shared between fibers",
      "is not shared between fibers if isolation level is fiber",
      "values should not bleed between threads",
    ],
    reason:
      "`thread_mattr_accessor` stores through `ActiveSupport::IsolatedExecutionState`, and " +
      "these cases assert the value is or is not visible from a second `Thread`/`Fiber` " +
      "under each isolation level (core_ext/module/attribute_accessors_per_thread.rb). JS has " +
      "neither, and the source file is already an unported-file row above.",
  },
  {
    testFile: "core_ext/class/attribute_test.rb",
    tests: ["when defined in a class's singleton", "allow to prepend accessors"],
    reason:
      "The first declares `class_attribute` inside a class's own singleton " +
      "class (`class << self`), whose lookup chain is what core_ext/class/attribute.rb:86-120 " +
      "walks; the second asserts `singleton_class.prepend` wraps the generated reader and " +
      "writer. A JS class has no metaclass apart from its own statics and no " +
      "`Module#prepend`, so there is no receiver for either shape.",
  },
  {
    testFile: "core_ext/module/attribute_accessor_test.rb",
    tests: ["declaring attributes on singleton errors"],
    reason:
      "Asserts `mattr_accessor` inside `class << klass` raises TypeError " +
      "(core_ext/module/attribute_accessors.rb:56, :122) and that no `@@my_attr` lands in " +
      "`Module.class_variables`. Both the singleton-class body and Ruby class variables " +
      "are Ruby-only, so the guard has nothing to fire on in TS.",
  },
  {
    testFile: "descendants_tracker_test.rb",
    tests: [".descendants with garbage collected classes"],
    reason:
      "Creates an anonymous subclass inside a `Thread.new` so the Ruby GC can collect it, " +
      "then asserts `descendants` drops it — the WeakSet behaviour of " +
      "descendants_tracker.rb:59-65, :107. JS exposes no way to force collection and " +
      "FinalizationRegistry gives no observation point, so the case cannot be written " +
      "deterministically.",
  },
  {
    testFile: "json/encoding_test.rb",
    tests: [
      "process status",
      "non utf8 string transcodes",
      "data encoding",
      "json gem dump by passing active support encoder",
      "json gem generate by passing active support encoder",
      "json gem pretty generate by passing active support encoder",
      "to json works on io objects",
    ],
    reason:
      "Each encodes a Ruby-only receiver or goes through the Ruby `json` gem: " +
      "`Process::Status` from a spawned child process via `$?` (encoding_test.rb:39-44), " +
      "a Shift_JIS String transcoded to UTF-8 (:84-89), `Data.define` (:349-356), `JSON.dump`/`generate`/" +
      "`pretty_generate` dispatching into the gem's `to_json(state)` protocol (:377-400), " +
      "and `STDOUT` as an IO (:482-484). None of them has a JS counterpart.",
  },
  {
    testFile: "time_zone_test.rb",
    tests: ["to yaml", "yaml load", "works as ruby time zone"],
    reason:
      "The two YAML cases round-trip a TimeZone through Psych's " +
      "`!ruby/object:ActiveSupport::TimeZone` tag; `works as ruby time zone` builds " +
      "`Time.new(2000, 1, 1, 1, in: zone)` and asserts `assert_same zone, time.zone` — " +
      "Ruby 3.1's `Time.new(in:)` keyword storing the TimeZone itself as the receiver's " +
      "zone object (time_zone_test.rb, `test_works_as_ruby_time_zone`). A JS `Date` has " +
      "no zone slot to hold it.",
  },
  {
    testFile: "core_ext/string_ext_test.rb",
    tests: ["emits normal string YAML"],
    reason:
      'Asserts `"foo".html_safe.to_yaml(foo: 1)` emits the same Psych document as ' +
      '`"foo".to_yaml` (string_ext_test.rb:1077), i.e. that SafeBuffer does not leak its ' +
      "own YAML tag. Psych is unported.",
  },
  {
    testFile: "core_ext/object/inclusion_test.rb",
    tests: ["in module"],
    reason:
      "`A.in?(B)` where A is a Module and B a class that `include A` resolves through " +
      "`Module#include?`, i.e. the Ruby ancestor chain (inclusion_test.rb:40-56). JS has " +
      "no module ancestry and no `include?` on a class, so `in?` has nothing to delegate " +
      "to. The file's `no method catching` sibling is portable and stays counted.",
  },
  {
    testFile: "core_ext/array/conversions_test.rb",
    tests: ["to xml with non hash different type elements"],
    reason:
      'Asserts `[1, 2.0, "3"].to_xml` tags the second element ' +
      '`<object type="float">2.0</object>` (conversions_test.rb:172-179). Ruby\'s `2.0` is a ' +
      "Float and `1` an Integer; JS has one number type where `2.0 === 2`, so the literal " +
      "cannot carry the Float-ness the assertion is about. The file's other eleven " +
      "`to_xml` cases are portable and stay counted.",
  },
  {
    testFile: "core_ext/module_test.rb",
    className: "ModuleTest",
    tests: [
      "private delegate",
      "private delegate prefixed",
      "private delegate with private option",
      "some public some private delegate with private option",
      "private delegate prefixed with private option",
    ],
    reason:
      "Each asserts `assert_not_respond_to place, :street` for a delegate made private by " +
      "`private(*delegate(...))` or `delegate ..., private: true` " +
      "(core_ext/module_test.rb:500-590). trails carries no method visibility at run time " +
      "(see CLAUDE.md, 'Method visibility is compile-time only'), so a defined delegate " +
      "answers `respond_to?` at both arities. The file's other delegate cases stay counted.",
  },
  {
    testFile: "configurable_test.rb",
    className: "ConfigurableActiveSupport",
    tests: ["the config_accessor method should not be publicly callable"],
    reason:
      "Asserts `assert_raises NoMethodError` on calling the private class method " +
      "`config_accessor` from outside the class body (configurable_test.rb:125-131, " +
      "`private :config_accessor`, configurable.rb:129). trails carries no method " +
      "visibility at run time (see CLAUDE.md, 'Method visibility is compile-time only'). " +
      "The file's other nine cases stay counted.",
  },
];
