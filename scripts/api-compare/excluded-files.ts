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
//                Consumed by isExcluded() → api:compare.
//                Omit for test-only entries where the source IS being ported.
//   `testFile` — substring match against the Ruby TEST file path
//                (from extract-ruby-tests.rb, e.g. "message_pack_test.rb").
//                Consumed by isTestExcluded() → test:compare.
//                Omit when there is no corresponding Rails test file.
//
// Most entries set both (source and test excluded together).
// Test-only entries (GVL, Rake, dbconsole, Ruby serialization) set only
// `testFile` because their TS source counterparts either don't exist or
// are being actively ported.

export type ExcludedFile = {
  reason: string;
} & ({ pattern: string; testFile?: string } | { pattern?: string; testFile: string });

export const EXCLUDED_FILES: ExcludedFile[] = [
  {
    pattern: "migration/compatibility",
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
    reason:
      "Thread-pool scheduled query with mutex + EventBuffer bridging Ruby's threaded async. " +
      "Marked :nodoc: in Rails. Collapses to the Promise returned by the adapter's async exec.",
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
    pattern: "legacy_yaml_adapter.rb",
    reason:
      "Migrates Psych::Coder YAML format versions (:nodoc:). Psych is Ruby-only; " +
      "JS doesn't use YAML for AR column serialization.",
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
    pattern: "destroy_association_async_job.rb",
    reason:
      "ActiveJob subclass that backs `dependent: :destroy_async`. Trails has not " +
      "ported ActiveJob; async destroy is out of scope until a job framework lands.",
  },
  {
    pattern: "dynamic_matchers.rb",
    reason:
      "Ruby `method_missing` magic that synthesizes `find_by_<attr>` / `find_or_*_by_<attr>` " +
      "at call time. No TS analog — Proxy-based dispatch can't infer attribute lists at " +
      "compile time, and `findBy({ ... })` already covers the use case idiomatically.",
  },
  {
    pattern: "railties/controller_runtime.rb",
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
    testFile: "transaction_isolation_test.rb",
    reason:
      "All tests require concurrent Ruby threads exercising the GVL. " +
      "Node.js is single-threaded; transaction-isolation guarantees verified by the DB engine, not the runtime.",
  },
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
];

export function isExcluded(file: string): boolean {
  return EXCLUDED_FILES.some((e) => e.pattern && file.includes(e.pattern));
}

export function isTestExcluded(testFile: string): boolean {
  return EXCLUDED_FILES.some((e) => e.testFile && testFile.includes(e.testFile));
}
