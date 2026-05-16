// Ruby files intentionally excluded from api:compare / test:compare.
//
// Two kinds of exclusions:
//   - pre-1.0 scope: features we haven't committed to porting yet
//     (migration compatibility shims, legacy adapters, etc.)
//   - not-applicable: Ruby-only concerns that don't map to JS
//     (thread-pool plumbing, Marshal/Psych/MessagePack formats, etc.)
//
// Each entry must set at least one of:
//   `pattern`  — substring match against the Ruby SOURCE file path
//                (from extract-ruby-api.rb, e.g. "promise.rb").
//                Consumed by isSourceUnported() → api:compare.
//                Omit for test-only entries where the source IS being ported.
//   `testFile` — substring match against the Ruby TEST file path
//                (from extract-ruby-tests.rb, e.g. "message_pack_test.rb").
//                Consumed by isTestFileUnported() → test:compare.
//                Omit when there is no corresponding Rails test file.
//
// Most entries set both (source and test excluded together).
// Test-only entries (GVL, Rake, dbconsole, Ruby serialization) set only
// `testFile` because their TS source counterparts either don't exist or
// are being actively ported.

export type UnportedFile = { reason: string } & (
  | { pattern: string; testFile?: string; tests?: never }
  | { pattern?: string; testFile: string; tests?: never }
  // Per-test exclusion: test-only — never affects api:compare.
  // Only the listed Ruby test descriptions are dropped from test:compare counts.
  // `className` narrows the match to a specific Ruby *Test class within the file,
  // enabling exclusion of GVL-only subclasses that share test names with portable ones.
  | { pattern?: never; testFile: string; className?: string; tests: string[] }
);

export const UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "migration/compatibility", // test excluded by extract-ruby-tests.rb SKIP_PATTERNS (/\/migration\//)
    reason: "Pre-1.0: legacy Rails version migration compatibility shims.",
  },
  {
    pattern: "promise.rb",
    reason:
      "Rails Promise wraps a thread-backed FutureResult with a blocking #value. " +
      "JS is single-threaded; native Promise covers #then. Async methods return Promise<T> directly.",
  },
  {
    pattern: "future_result.rb",
    testFile: "relation/load_async_test.rb",
    reason:
      "Thread-pool scheduled query with mutex + EventBuffer bridging Ruby's threaded async. " +
      "Marked :nodoc: in Rails. Collapses to the Promise returned by the adapter's async exec. " +
      "Test file fully excluded — all live test classes exercise FutureResult/scheduled? semantics " +
      "that don't port to single-threaded JS where `await relation.toArray()` is the async surface.",
  },
  {
    pattern: "asynchronous_queries_tracker.rb",
    testFile: "asynchronous_queries_test.rb",
    reason:
      "Per-thread async session barriers (Concurrent::AtomicBoolean, ReadWriteLock). " +
      "No equivalent in single-threaded event-loop JS.",
  },
  {
    pattern: "marshalling.rb",
    testFile: "marshal_serialization_test.rb",
    reason:
      "Ruby's Marshal binary format (Marshal.dump/load). No JS equivalent; " +
      "JS cache/session layers use JSON or structured clone.",
  },
  {
    pattern: "message_pack.rb",
    testFile: "message_pack_test.rb",
    reason:
      "Rails-integrated MessagePack (:nodoc:) registers AR records with " +
      "ActiveSupport::MessagePack encoder/decoder. Ruby-only coupling; " +
      "MessagePack-the-format exists in JS but this file is the Marshal bridge, not a reusable impl.",
  },
  {
    pattern: "legacy_yaml_adapter.rb", // no test counterpart
    reason:
      "Migrates Psych::Coder YAML format versions (:nodoc:). Psych is Ruby-only; " +
      "JS doesn't use YAML for AR column serialization.",
  },
  {
    pattern: "attribute_set/yaml_encoder.rb", // no test counterpart
    reason:
      "Rails' Psych-specific YAML round-trip class for AttributeSet. Replaced by " +
      "the pluggable AttributeSetCoder architecture in #1173 (P24a) / #1176 (P24b) " +
      "— see packages/activemodel/src/attribute-set/{coder.ts,codecs/json.ts,codecs/yaml.ts}. " +
      "Functional capability is shipped; the Rails class hierarchy doesn't map " +
      "to the TS codec-injection pattern (no Psych, JSON is the default).",
  },
  {
    pattern: "coders/yaml_column.rb",
    testFile: "coders/yaml_column_test.rb",
    reason:
      "YAML column coder built on Psych. `serialize :col, coder: YAMLColumn` has " +
      "no natural JS analog; JSON is the default column coder instead.",
  },
  {
    pattern: "fixtures.rb",
    testFile: "fixtures_test.rb",
    reason:
      "Rails-specific YAML fixtures (test/fixtures/*.yml loaded once into the DB " +
      "with named-row references and ERB preprocessing). The JS/TS ecosystem uses " +
      "factories or ad-hoc Model.create instead; Trails users won't ship YAML fixtures.",
  },
  {
    pattern: "fixture_set",
    testFile: "fixture_set/",
    reason:
      "Supporting machinery for YAML fixtures (FixtureSet file/table-row/render-context/" +
      "model-metadata/identify). Excluded along with fixtures.rb.",
  },
  {
    pattern: "test_fixtures.rb",
    testFile: "test_fixtures_test.rb",
    reason:
      "Rails test concern that wires fixtures into ActiveSupport::TestCase " +
      "(setup_fixtures, transactional rollback per test). Tied to YAML fixtures " +
      "and the Minitest lifecycle; Vitest tests use per-test factories instead.",
  },
  {
    pattern: "encryption/encrypted_fixtures.rb",
    testFile: "encryption/encrypted_fixtures_test.rb",
    reason: "Encrypts YAML fixture rows on load. Excluded transitively with fixtures.rb.",
  },
  {
    pattern: "destroy_association_async_job.rb", // no test counterpart
    reason:
      "ActiveJob subclass that backs `dependent: :destroy_async`. Trails has not " +
      "ported ActiveJob; async destroy is out of scope until a job framework lands.",
  },
  {
    pattern: "dynamic_matchers.rb", // no test counterpart
    reason:
      "Ruby `method_missing` magic that synthesizes `find_by_<attr>` / `find_or_*_by_<attr>` " +
      "at call time. No TS analog — Proxy-based dispatch can't infer attribute lists at " +
      "compile time, and `findBy({ ... })` already covers the use case idiomatically.",
  },
  {
    pattern: "railties/controller_runtime.rb",
    testFile: "controller_runtime_test.rb",
    reason:
      "Railties ActionController integration that logs DB runtime per request. " +
      "Trails has not ported Railties / ActionController; reintroduce when a web " +
      "framework integration lands.",
  },
  {
    pattern: "adapters/trilogy",
    testFile: "adapters/trilogy/",
    reason:
      "Trilogy is a C extension for Ruby with no Node.js equivalent. MySQL connections " +
      "go through Mysql2Adapter instead.",
  },
  {
    pattern: "trilogy_adapter.rb",
    testFile: "trilogy_adapter_test.rb",
    reason: "Trilogy adapter implementation; excluded along with adapters/trilogy.",
  },
  // --- Permanently not-portable: GVL / thread-model ---
  {
    testFile: "schema_loading_test.rb",
    reason:
      "Tests ActiveSupport.on_load / Zeitwerk autoload hooks triggered from background threads. " +
      "No Node.js equivalent; ES module loading is synchronous and non-concurrent.",
  },
  {
    testFile: "reload_models_test.rb",
    reason:
      "Tests class reloading via ActiveSupport::Dependencies / Zeitwerk in a forked process. " +
      "No Node.js equivalent; ES modules are cached for the process lifetime.",
  },
  // --- Permanently not-portable: Rake tasks / dbconsole PTY ---
  {
    testFile: "adapters/postgresql/postgresql_rake_test.rb",
    reason:
      "Tests Rake db:create/drop/migrate tasks via shell exec. " +
      "Rake and PTY shell-out have no Node.js equivalent; Trails uses migration scripts instead.",
  },
  {
    testFile: "adapters/mysql2/mysql2_rake_test.rb",
    reason:
      "Tests Rake db:create/drop/migrate tasks for MySQL via shell exec. " +
      "Rake and PTY shell-out have no Node.js equivalent.",
  },
  {
    testFile: "adapters/sqlite3/sqlite_rake_test.rb",
    reason:
      "Tests Rake db:create/drop/migrate tasks for SQLite via shell exec. " +
      "Rake and PTY shell-out have no Node.js equivalent.",
  },
  {
    testFile: "adapters/postgresql/dbconsole_test.rb",
    reason:
      "Tests `rails dbconsole` PTY/exec invocation for PostgreSQL. " +
      "Spawning a PTY-backed interactive subprocess has no Node.js equivalent.",
  },
  {
    testFile: "adapters/mysql2/dbconsole_test.rb",
    reason:
      "Tests `rails dbconsole` PTY/exec invocation for MySQL. " +
      "Spawning a PTY-backed interactive subprocess has no Node.js equivalent.",
  },
  {
    testFile: "adapters/sqlite3/dbconsole_test.rb",
    reason:
      "Tests `rails dbconsole` PTY/exec invocation for SQLite. " +
      "Spawning a PTY-backed interactive subprocess has no Node.js equivalent.",
  },
  // --- Permanently not-portable: single-process SQLite driver limits ---
  {
    testFile: "adapters/sqlite3/transaction_test.rb",
    tests: ["opens a `read_uncommitted` transaction"],
    reason:
      "Cross-connection read_uncommitted visibility requires SQLITE_OPEN_SHAREDCACHE. " +
      "better-sqlite3 does not expose this flag, so two connections cannot share a cache.",
  },
  // --- Permanently not-portable: Ruby Module namespace / constant-path semantics ---
  {
    testFile: "reflection_test.rb",
    tests: [
      "symbol for class name",
      "name error from incidental code is not converted to name error for association",
      "automatic inverse suppresses name error for association",
      "automatic inverse does not suppress name error from incidental code",
    ],
    reason:
      "Ruby Symbol type for class_name and const_missing hook for NameError discrimination " +
      "have no JavaScript equivalent.",
  },
  {
    testFile: "modules_test.rb",
    tests: [
      "module spanning associations",
      "module spanning has and belongs to many associations",
      "associations spanning cross modules",
      "find account and include company",
      "eager loading in modules",
    ],
    reason:
      "Ruby Module#ancestors / constant-path lookup for cross-module association resolution. " +
      "No JS equivalent for namespace-scoped class discovery.",
  },
  // --- Permanently not-portable: per-test GVL / serialization in mixed files ---
  {
    testFile: "connection_handlers_sharding_db_test.rb",
    tests: [
      "swapping shards globally in a multi threaded environment",
      "swapping shards and roles in a multi threaded environment",
      "swapping granular shards and roles in a multi threaded environment",
    ],
    reason:
      "GVL / Ruby Thread semantics — concurrent shard-swapping tests cannot translate to single-threaded Node.js.",
  },
  {
    testFile: "connection_pool_test.rb",
    tests: [
      "lock thread allow fiber reentrency",
      "released connection moves between threads",
      "inactive are returned from dead thread",
      "remove connection for thread",
      "concurrent connection establishment",
      "non bang disconnect and clear reloadable connections throw exception if threads dont return their conns",
      "disconnect and clear reloadable connections attempt to wait for threads to return their conns",
      "bang versions of disconnect and clear reloadable connections if unable to acquire all connections proceed anyway",
      "disconnect and clear reloadable connections are able to preempt other waiting threads",
      "clear reloadable connections creates new connections for waiting threads if necessary",
      "public connections access threadsafe",
    ],
    reason:
      "GVL / Ruby Thread semantics — concurrent connection tests cannot translate to single-threaded Node.js.",
  },
  {
    testFile: "serialized_attribute_test.rb",
    tests: [
      "serialized class attribute",
      "serialized class does not become frozen",
      "serialized attribute should raise exception on assignment with wrong type",
      "serialized attribute with class constraint",
      "where by serialized attribute with array",
      "where by serialized attribute with hash",
      "where by serialized attribute with hash in array",
      "serialize attribute via select method when time zone available",
      "serialize attribute can be serialized in an integer column",
      "classes without no arg constructors are not supported",
      "is not changed when stored blob",
      "is not changed when stored in blob frozen payload",
      "decorated type with type for attribute",
      "decorated type with decorator block",
      "serialized attribute works under concurrent initial access",
      "serialized time attribute",
      "supports permitted classes for default column serializer",
    ],
    reason:
      "YAML/Psych column serialization and class-constrained serializers — Ruby-only format with no Node.js equivalent.",
  },
  {
    testFile: "base_test.rb",
    tests: [
      // GVL
      "new threads get default the default connection handler",
      "changing a connection handler in a main thread does not poison the other threads",
      // Ruby Marshal serialization
      "marshal round trip",
      "marshal inspected round trip",
      "marshal new record round trip",
      "marshalling with associations 6 1",
      "marshalling with associations 7 1",
      "marshal between processes",
      "marshalling new record round trip with associations",
      // Ruby string encoding
      "respect internal encoding",
      // with_env_tz — process-level TZ change (ENV["TZ"]); Node.js cannot reload TZ after startup
      "default in local time",
      "switching default time zone",
      "mutating time objects",
    ],
    reason:
      "GVL / Ruby Thread semantics, Marshal binary serialization, Encoding.default_internal, " +
      'and with_env_tz (process-level ENV["TZ"] reload) — all Ruby-only with no Node.js equivalent.',
  },
  {
    testFile: "hstore_test.rb",
    tests: [
      // ActionController::Parameters#to_unsafe_h — Ruby-only ProtectedParams API
      "supports to unsafe h values",
    ],
    reason:
      "ActionController::Parameters#to_unsafe_h is a Ruby-only ProtectedParams API; " +
      "no equivalent in Node.js request-parameter handling.",
  },
  {
    testFile: "has_and_belongs_to_many_associations_test.rb",
    tests: ["marshal dump"],
    reason: "Ruby Marshal binary serialization — no Node.js equivalent.",
  },
  {
    testFile: "reaper_test.rb",
    tests: ["connection pool starts reaper in fork"],
    reason: "GVL / Ruby fork() semantics — process forking has no Node.js equivalent.",
  },
  // --- Permanently not-portable: Ruby serialization formats ---
  {
    testFile: "yaml_serialization_test.rb",
    reason:
      "Tests YAML round-trips of arbitrary Ruby objects (Psych encoding). " +
      "No Node.js equivalent; JSON is the default column serialization format in Trails.",
  },
  {
    testFile: "binary_test.rb",
    reason:
      "Tests Marshal/YAML binary encoding of AR records. " +
      "Ruby binary serialization formats have no Node.js equivalent.",
  },
  // --- globalid: Ruby pattern matching (`case ... in`) ---
  {
    testFile: "pattern_matching_test.rb",
    reason:
      "Tests Ruby's `case ... in` pattern matching against URI::GID via " +
      "`deconstruct_keys`. TypeScript has no equivalent destructuring " +
      "protocol; callers read `.app` / `.modelName` / `.modelId` / `.params` " +
      "directly off the GID instance.",
  },
  // --- globalid: Rails::Railtie wiring ---
  {
    testFile: "railtie_test.rb",
    reason:
      "Exercises Rails::Railtie boot wiring for GlobalID — `app_id`, " +
      "`expires_in`, verifier secret derivation from Rails.application. " +
      "Trails has no Railtie analogue; wiring happens via the package-local " +
      "`wire.ts` side-effect import and explicit `setApp` / verifier setters.",
  },
  // --- globalid: module-based `only:` filters (Ruby modules have no TS analogue) ---
  {
    testFile: "global_locator_test.rb",
    className: "GlobalLocatorTest",
    tests: [
      "by GID with only: restriction by module",
      "by GID with only: restriction by module no match",
      "by GID with only: restriction by multiple types w/module",
      "by SGID with only: restriction by module",
      "by SGID with only: restriction by module no match",
      "by SGID with only: restriction by multiple types w/module",
    ],
    reason:
      "Ruby `only:` accepts a Module to filter records whose class includes " +
      "that module. TypeScript has no module-include relationship for " +
      "classes; `instanceof` only works against constructors. The " +
      "class-based `only:` cases are covered by the matching non-module " +
      "tests in the same file.",
  },
  // --- globalid: module-based `only:` filters on GlobalID#find (same as above) ---
  {
    testFile: "global_id_test.rb",
    className: "GlobalIDCreationTest",
    tests: [
      "find with module",
      "find with module no match",
      "find with multiple module",
      "find with multiple module no match",
    ],
    reason:
      "Ruby `only:` accepts a Module to filter records whose class includes " +
      "that module. TypeScript has no module-include relationship for " +
      "classes; the class-based equivalents (`find with class`, `find with " +
      "multiple class`) cover the same routing logic.",
  },
  // --- globalid: eager-loading `includes:` (AR feature, out of GlobalID scope) ---
  {
    testFile: "global_locator_test.rb",
    className: "GlobalLocatorTest",
    tests: [
      "by GID with eager loading",
      "by GID trying to eager load an unexisting relationship",
      "by many GIDs with eager loading",
      "by many GIDs trying to eager load an unexisting relationship",
    ],
    reason:
      "Eager loading via `includes:` is an ActiveRecord feature that lives " +
      "outside the GlobalID scope. The Locator forwards the option but " +
      "globalid's own behavior is exercised by the non-eager variants.",
  },
  // --- globalid: legacy self-validated SGID metadata + cross-class equality ---
  {
    testFile: "signed_global_id_test.rb",
    className: "SignedGlobalIDPurposeTest",
    tests: ["parse is backwards compatible with the self validated metadata"],
    reason:
      "Backwards-compat path for SGIDs issued by globalid <1.3.0 before " +
      "verifier-validated metadata existed. Trails has no pre-1.3.0 SGIDs " +
      "in circulation; `verifyWithLegacySelfValidatedMetadata` exists as a " +
      "nominal stub for api:compare parity.",
  },
  {
    testFile: "signed_global_id_test.rb",
    className: "SignedGlobalIDTest",
    tests: ["value equality with an unsigned id"],
    reason:
      "Asserts a SignedGlobalID equals an unsigned GlobalID with the same " +
      "URI. Cross-class equality across @blazetrails/globalid subpath " +
      "imports hits the TS private-field nominal-typing trap; the " +
      "`SignedGlobalID#equals` contract is symmetric only within its own " +
      "class. Same-class equality is covered by `value equality`.",
  },
  // --- globalid: Ruby-Marshal exact-token assertion ---
  {
    testFile: "verifier_test.rb",
    className: "VerifierTest",
    tests: ["generates URL-safe messages"],
    reason:
      "Asserts byte-for-byte equality against a known token produced by " +
      "Ruby's Marshal serializer wrapped in MessageVerifier. Our globalid " +
      "Verifier uses JSON serialization (the default for our MessageVerifier), " +
      "so the encoded payload differs structurally — the same input produces " +
      "a different (but equivalent) token. The behavioral guarantee this " +
      "test cares about (urlsafe encoding, no +/=/ chars) is covered by " +
      "packages/globalid/src/verifier.test.ts asserting char-class absence " +
      "rather than exact bytes.",
  },
];

export function isSourceUnported(file: string): boolean {
  return UNPORTED_FILES.some((e) => e.pattern && file.includes(e.pattern));
}

export function isTestFileUnported(testFile: string): boolean {
  return UNPORTED_FILES.some((e) => e.testFile && !e.tests && testFile.includes(e.testFile));
}

export function isTestCaseUnported(
  testFile: string,
  testName: string,
  className?: string,
): boolean {
  return UNPORTED_FILES.some(
    (e) =>
      e.testFile &&
      e.tests &&
      testFile.includes(e.testFile) &&
      e.tests.includes(testName) &&
      (e.className === undefined || e.className === className),
  );
}
