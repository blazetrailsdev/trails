// Internal module: no imports, no public API surface.
// Shared between counter-cache.ts and associations/builder/belongs-to.ts
// so that the pending map stays off the public subpath exports.
//
// The single deferral trails needs over Rails' belongs_to.rb:39-41, which
// resolves the target with `reflection.class_name.safe_constantize` and unions
// the column onto it right there. Ruby autoloads the constant at that moment;
// ESM cannot, so a `belongs_to ..., counter_cache:` declared before its target
// module has evaluated stages here, keyed by the class name the registry will
// use, and `registerModel` applies it under that exact key.
//
// Values are *thunks*, not resolved column strings: the column name is
// re-derived at flush time. A belongs_to staged before its target class is
// registered (e.g. CpkBook defined before CpkOrder in cpk.ts) would otherwise
// resolve `counterCacheColumn()` against an empty registry and fall back to the
// non-demodulized `cpk_books_count` instead of `books_count`.
//
// Entries are kept after a flush so a target class re-defined and re-registered
// between tests picks the column up again; the union at the flush site makes
// repeated applications idempotent.
export const pendingCounterCacheColumns = new Map<string, Set<() => string>>();
