import { describe, expect, it } from "vitest";
import { DupCoder, MemoryStore } from "./memory-store.js";
import { Entry } from "./entry.js";

// trails-only coverage for `ActiveSupport::Cache::MemoryStore::DupCoder`
// (memory_store.rb:29-70), which Rails exercises only indirectly through the
// shared cache-store behaviour suites.
describe("DupCoder", () => {
  it("deep-clones plain objects", () => {
    const obj = { a: { b: 1 }, c: [2, 3] };
    const dup = DupCoder.load(DupCoder.dump(new Entry(obj))).value as typeof obj;
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
    expect(dup.a).not.toBe(obj.a);
  });

  it("deep-clones arrays", () => {
    const arr = [{ x: 1 }, { y: 2 }];
    const dup = DupCoder.load(DupCoder.dump(new Entry(arr))).value as typeof arr;
    expect(dup).toEqual(arr);
    expect(dup[0]).not.toBe(arr[0]);
  });

  it("returns primitives unchanged", () => {
    for (const value of [42, true, null]) {
      const entry = new Entry(value);
      expect(DupCoder.dump(entry)).toBe(entry);
    }
  });

  it("preserves expiresAt and version", () => {
    const entry = new Entry({ a: 1 }, { expiresAt: 1234, version: "v1" });
    const loaded = DupCoder.load(DupCoder.dump(entry));
    expect(loaded.expiresAt).toBe(1234);
    expect(loaded.version).toBe("v1");
    expect(loaded.value).toEqual({ a: 1 });
  });

  it("round-trips a string without wrapping it", () => {
    const entry = new Entry("hello");
    expect(DupCoder.load(DupCoder.dump(entry)).value).toBe("hello");
  });

  it("dumpCompressed compresses past the threshold", () => {
    const entry = new Entry("a".repeat(2000));
    expect(DupCoder.dumpCompressed(entry, 1).isCompressed()).toBe(true);
    expect(DupCoder.dumpCompressed(entry, 1).value).toBe("a".repeat(2000));
    expect(DupCoder.dumpCompressed(entry, Infinity).isCompressed()).toBe(false);
  });

  it("load leaves a compressed entry alone", () => {
    const compressed = DupCoder.dumpCompressed(new Entry("a".repeat(2000)), 1);
    expect(DupCoder.load(compressed)).toBe(compressed);
  });
});

describe("MemoryStore serialization", () => {
  it("routes writes through DupCoder so a stored value cannot alias the caller's", () => {
    const store = new MemoryStore();
    const value = { a: { b: 1 } };
    store.write("foo", value);
    value.a.b = 2;
    expect(store.read("foo")).toEqual({ a: { b: 1 } });
  });

  it("compresses past the threshold when compress is set", () => {
    const store = new MemoryStore({ compress: true, compressThreshold: 1 });
    const value = "a".repeat(2000);
    store.write("foo", value);
    const data = (store as unknown as { data: Map<string, { payload: Entry }> }).data;
    expect(data.get("foo")!.payload.isCompressed()).toBe(true);
    expect(store.read("foo")).toBe(value);
  });

  it("stores uncompressed by default", () => {
    const store = new MemoryStore();
    store.write("foo", "a".repeat(2000));
    const data = (store as unknown as { data: Map<string, { payload: Entry }> }).data;
    expect(data.get("foo")!.payload.isCompressed()).toBe(false);
  });
});
