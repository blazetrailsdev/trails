// Internal module: no imports, no public API surface.
// Shared between counter-cache.ts and associations/builder/belongs-to.ts
// so that the pending map stays off the public subpath exports.
//
// Values are *thunks*, not resolved column strings: the column name is
// re-derived at flush time. A belongs_to staged before its target class is
// registered (e.g. CpkBook defined before CpkOrder in cpk.ts) would otherwise
// resolve `counterCacheColumn()` against an empty registry and fall back to the
// non-demodulized `cpk_books_count` instead of `books_count`. Deferring the
// computation lets the flush at registerModel time see the now-registered
// target and its inverse hasMany, yielding the correct column.
export const pendingCounterCacheColumns = new Map<string, Set<() => string>>();
