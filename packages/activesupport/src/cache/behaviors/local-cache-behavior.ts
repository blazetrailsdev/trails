import { it } from "vitest";

// Mirrors Rails `LocalCacheBehavior`
// (activesupport/test/cache/behaviors/local_cache_behavior.rb). Ruby's
// `include LocalCacheBehavior` is spelled here as a function the store test
// file calls inside its own describe, the trails spelling of a test-behavior
// mixin (see cache-store-compression-behavior.ts).
//
// The local-cache strategy (`ActiveSupport::Cache::Strategy::LocalCache`) is
// not ported yet, so the cases carried here are the permanent-skip stubs the
// including store tests used to hold — they name the Rails cases so
// `parity:test` credits them against the module rather than against one store.

/** @internal */
export function localCacheBehavior(): void {
  it.skip("clear also clears local cache");
}
