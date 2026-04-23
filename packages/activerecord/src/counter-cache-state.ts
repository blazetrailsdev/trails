// Internal module: no imports, no public API surface.
// Shared between counter-cache.ts and associations/builder/belongs-to.ts
// so that the pending map stays off the public subpath exports.
export const pendingCounterCacheColumns = new Map<string, Set<string>>();
