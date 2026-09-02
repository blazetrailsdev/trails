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

  // ---------------------------------------------------------------------------
  // Case-level exclusions from the AR-closure skip-stub triage (RFC 0105,
  // `triage-activesupport-in-closure-skip-stubs`). Every row below names the
  // Ruby-only mechanism the case is written on — Thread/Fiber, Psych, Marshal,
  // Ruby Encoding, Ruby constant/singleton-class metaprogramming, GC, or a
  // child process. Their sibling cases in the same file stay counted and are
  // owned by the RFC 0105 porting stories.
  // ---------------------------------------------------------------------------
  {
    testFile: "share_lock_test.rb",
    tests: [
      "reentrancy",
      "sharing doesnt block",
      "sharing blocks exclusive",
      "exclusive blocks sharing",
      "multiple exclusives are able to progress",
      "sharing is upgradeable to exclusive",
      "exclusive upgrade waits for other sharers to leave",
      "exclusive matching purpose",
      "killed thread loses lock",
      "exclusive conflicting purpose",
      "exclusive ordering",
      "new share attempts block on waiting exclusive",
      "share remains reentrant ignoring a waiting exclusive",
      "compatible exclusives cooperate to both proceed",
      "manual yield",
      "manual incompatible yield",
      "manual recursive yield",
      "manual recursive yield cannot expand outer compatible",
      "manual recursive yield restores previous compatible",
      "in shared section incompatible non upgrading threads cannot preempt upgrading threads",
      "happy path",
      "detects stuck thread",
      "detects free thread",
      "detects already released",
      "detects remains latched",
    ],
    reason:
      "Every case drives ActiveSupport::Concurrency::ShareLock from several `Thread.new` " +
      "workers through the file's own `assert_threads_stuck` / `assert_threads_not_stuck` " +
      "helpers (share_lock_test.rb:495-513), asserting Monitor/ConditionVariable blocking, thread " +
      "ownership and `Thread#kill` unwind. JS is single-threaded and has no preemptible " +
      "thread, no Monitor and no way to observe a blocked one, so the assertions have no " +
      "meaning; the lock's non-blocking bookkeeping is covered by the file's other cases.",
  },
  {
    testFile: "dependencies_test.rb",
    tests: [
      "require_dependency looks autoload paths up",
      "require_dependency looks autoload paths up (idempotent)",
      "require_dependency handles absolute paths correctly",
      "require_dependency handles absolute paths correctly (idempotent)",
      "require_dependency supports arguments that respond to to_path",
      "require_dependency supports arguments that respond to to_path (idempotent)",
      "require_dependency fallback to Kernel#require",
      "require_dependency fallback to Kernel#require (idempotent)",
      "require_dependency raises LoadError if the given argument is not found",
      "require_dependency raises ArgumentError if the argument is not a String and does not respond to #to_path",
    ],
    reason:
      "`require_dependency` is a thin wrapper over Ruby's `Kernel#require` against " +
      "`$LOAD_PATH`/`autoload_paths` (dependencies/require_dependency.rb:11-23), and each case asserts a " +
      "synchronous load, its idempotence on a second call, `Pathname#to_path` coercion, or " +
      "the `LoadError` it raises. ESM `import` is asynchronous, resolves through the " +
      "package graph rather than a mutable load path, and caches per specifier, so there " +
      "is nothing for the trails port to answer these against.",
  },
  {
    testFile: "autoload_test.rb",
    tests: [
      "the autoload module works like normal autoload",
      "when specifying an :eager constant it still works like normal autoload by default",
      "the location of autoloaded constants defaults to :name.underscore",
      "the location of :eager autoloaded constants defaults to :name.underscore",
      "a directory for a block of autoloads can be specified",
      "a path for a block of autoloads can be specified",
    ],
    reason:
      "ActiveSupport::Autoload registers `Module#autoload` entries and the cases assert " +
      "them through `autoload?`/`const_get` — a constant that resolves to a file on first " +
      "reference (dependencies/autoload.rb:30-42). JS has no lazily-resolved binding: an `import` is " +
      "eager and a namespace object exposes no autoload table, so `autoload?` has no " +
      "counterpart to assert against.",
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
      "default value is accessible from other threads",
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
    tests: [
      "works well with singleton classes",
      "when defined in a class's singleton",
      "works well with module singleton classes",
      "allow to prepend accessors",
    ],
    reason:
      "The first three declare or read `class_attribute` through an object's singleton " +
      "class (`object.singleton_class.setting=`, `class << self`), whose lookup chain is " +
      "what core_ext/class/attribute.rb:86-120 walks; the fourth asserts `singleton_class.prepend` " +
      "wraps the generated reader and writer. JS has no per-object singleton class and no " +
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
    testFile: "multibyte_proxy_test.rb",
    tests: ["custom multibyte encoder"],
    reason:
      "Swaps `ActiveSupport::Multibyte.proxy_class` and asserts `String#mb_chars` returns " +
      "the replacement proxy (multibyte.rb:14-21). `core_ext/string/multibyte.rb` is " +
      "already an unported-file row above — JS strings are Unicode and carry no Encoding, " +
      "so there is no `mb_chars` for a proxy class to answer.",
  },
  {
    testFile: "json/encoding_test.rb",
    tests: [
      "process status",
      "non utf8 string transcodes",
      "struct to json with options",
      "struct to json with options nested",
      "struct encoding",
      "data encoding",
      "json gem dump by passing active support encoder",
      "json gem generate by passing active support encoder",
      "json gem pretty generate by passing active support encoder",
      "to json works on io objects",
    ],
    reason:
      "Each encodes a Ruby-only receiver or goes through the Ruby `json` gem: " +
      "`Process::Status` from a spawned child process via `$?` (encoding_test.rb:39-44), " +
      "a Shift_JIS String transcoded to UTF-8 (:84-89), `Struct`/`Struct.new` members " +
      "(:159-186, :319-347) and `Data.define` (:349-356), `JSON.dump`/`generate`/" +
      "`pretty_generate` dispatching into the gem's `to_json(state)` protocol (:377-400), " +
      "and `STDOUT` as an IO (:482-484). None of the five has a JS counterpart.",
  },
  {
    testFile: "core_ext/time_with_zone_test.rb",
    tests: ["to yaml", "ruby to yaml", "yaml load", "ruby yaml load"],
    reason:
      "Round-trip TimeWithZone through Psych — `to_yaml` emits the " +
      "`!ruby/object:ActiveSupport::TimeWithZone` tag and `YAML.load` rebuilds it from the " +
      "`utc`/`zone`/`time` ivars (time_with_zone.rb:174-181). YAML with Ruby object tags " +
      "has no JS equivalent, and Psych is an unported format across the repo.",
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
];
