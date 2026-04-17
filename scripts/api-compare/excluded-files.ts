// Ruby files intentionally excluded from api:compare / test:compare.
//
// Two kinds of exclusions:
//   - pre-1.0 scope: features we haven't committed to porting yet
//     (migration compatibility shims, legacy adapters, etc.)
//   - not-applicable: Ruby-only concerns that don't map to JS
//     (thread-pool plumbing, Marshal/Psych/MessagePack formats, etc.)
//
// `pattern` matches against the Ruby source file path from extract-ruby-api.rb
// (e.g. "promise.rb", "coders/yaml_column.rb").
// `testFile` (optional) matches against the Ruby test file path from
// extract-ruby-tests.rb (e.g. "message_pack_test.rb"). Omit when there is
// no corresponding test file in the Rails suite.

export interface ExcludedFile {
  pattern: string;
  testFile?: string;
  reason: string;
}

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
];

export function isExcluded(file: string): boolean {
  return EXCLUDED_FILES.some((e) => file.includes(e.pattern));
}

export function isTestExcluded(testFile: string): boolean {
  return EXCLUDED_FILES.some((e) => e.testFile && testFile.includes(e.testFile));
}
