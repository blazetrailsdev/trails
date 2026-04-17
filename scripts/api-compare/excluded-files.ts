// Ruby files intentionally excluded from api:compare.
//
// Two kinds of exclusions:
//   - pre-1.0 scope: features we haven't committed to porting yet
//     (migration compatibility shims, legacy adapters, etc.)
//   - not-applicable: Ruby-only concerns that don't map to JS
//     (thread-pool plumbing, mutex-guarded schedulers, etc.)
//
// Patterns are matched as substrings against the Ruby file path reported
// by extract-ruby-api.rb (e.g. "promise.rb", "migration/compatibility.rb").

export interface ExcludedFile {
  pattern: string;
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
    reason:
      "Per-thread async session barriers (Concurrent::AtomicBoolean, ReadWriteLock). " +
      "No equivalent in single-threaded event-loop JS.",
  },
];

export function isExcluded(file: string): boolean {
  return EXCLUDED_FILES.some((e) => file.includes(e.pattern));
}
