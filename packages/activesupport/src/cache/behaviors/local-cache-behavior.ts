import { it } from "vitest";

// Mirrors Rails `LocalCacheBehavior`
// (activesupport/test/cache/behaviors/local_cache_behavior.rb). Ruby's
// `include LocalCacheBehavior` is spelled here as a function the store test
// file calls inside its own describe, the trails spelling of a test-behavior
// mixin (see cache-store-compression-behavior.ts).
//
// `ActiveSupport::Cache::Strategy::LocalCache` — the module every case here
// drives through `@cache.with_local_cache` — is not ported, so the whole
// module is carried as the permanent-skip stubs the including store tests used
// to hold. They name the Rails cases in one place, against the Rails module,
// rather than crediting whichever store test happened to list them.

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby spells this `include LocalCacheBehavior`
 * (activesupport/test/cache/behaviors/local_cache_behavior.rb); TS has no `include` for a test
 * mixin, so the module is a function the including describe calls. Rails TEST
 * code is outside the Ruby extractor's population, so no manifest can back it.
 */
export function localCacheBehavior(): void {
  it.skip("instrumentation with local cache");
  it.skip("local writes are persistent on the remote cache");
  it.skip("clear also clears local cache");
  it.skip("clear with nil options");
  it.skip("cleanup clears local cache but not remote cache");
  it.skip("local cache of write");
  it.skip("local cache of read returns a copy of the entry");
  it.skip("local cache of read");
  it.skip("local cache of read nil");
  it.skip("local cache fetch");
  it.skip("local cache fetch on miss");
  it.skip("local cache of write nil");
  it.skip("local cache of write with unless exist");
  it.skip("local cache of delete");
  it.skip("local cache of delete matched");
  it.skip("local cache of exist");
  it.skip("local cache of increment");
  it.skip("local cache of decrement");
  it.skip("local cache of fetch multi");
  it.skip("local cache of read multi");
  it.skip("local cache of read multi with expiry");
  it.skip("local cache of read multi with versions");
  it.skip("local cache of read multi prioritizes local entries");
  it.skip("initial object mutation after write");
  it.skip("initial object mutation after fetch");
  it.skip("middleware");
  it.skip("local race condition protection");
  it.skip("local cache should read and write false");
  it.skip("local cache should deserialize entries on multi get");
}
