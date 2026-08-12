import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store.js";
import { Entry } from "./entry.js";

// trails-only coverage for the two Ruby-truthiness arms of `Store#initialize`
// (cache.rb:296-312), which Rails exercises only indirectly.
describe("Store coder options", () => {
  it("keeps an explicit compress_threshold of 0", () => {
    // Ruby `@options[:compress_threshold] ||= DEFAULT_COMPRESS_LIMIT` leaves 0
    // in place because 0 is truthy in Ruby (cache.rb:299).
    const store = new MemoryStore({ compress: true, compressThreshold: 0 });
    expect(store.options.compressThreshold).toBe(0);
  });

  it("installs the passthrough serializer for an explicit nil coder", () => {
    // `@options.delete(:coder) { ... }` runs its block only when the key is
    // absent, so `coder: nil` survives to `@coder ||=
    // SerializerWithFallback[:passthrough]` (cache.rb:301-310) and entries are
    // stored directly rather than dumped.
    const store = new MemoryStore({ coder: null });
    store.write("foo", { a: 1 });
    const data = (store as unknown as { data: Map<string, Entry> }).data;
    expect(data.get("foo")).toBeInstanceOf(Entry);
    expect(store.read("foo")).toEqual({ a: 1 });
  });
});
