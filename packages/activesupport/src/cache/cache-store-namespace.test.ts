import { describe, it, expect } from "vitest";
import { MemoryStore } from "./memory-store.js";
import { coder } from "./coder.js";

// Mirrors Rails' `cache.instance_variable_get(:@data)["tester:foo"].value`
// peek at the raw namespaced key.
function rawValue(cache: MemoryStore, key: string): unknown {
  const data = (cache as unknown as { data: Map<string, { encodedValue: string }> }).data;
  const rec = data.get(key);
  if (!rec) return undefined;
  return coder.load(rec.encodedValue);
}

describe("CacheStoreNamespaceTest", () => {
  it("static namespace", () => {
    const cache = new MemoryStore({ namespace: "tester" });
    cache.write("foo", "bar");
    expect(cache.read("foo")).toBe("bar");
    expect(rawValue(cache, "tester:foo")).toBe("bar");
  });

  it("proc namespace", () => {
    const testVal = "tester";
    const proc = () => testVal;
    const cache = new MemoryStore({ namespace: proc });
    cache.write("foo", "bar");
    expect(cache.read("foo")).toBe("bar");
    expect(rawValue(cache, "tester:foo")).toBe("bar");
  });

  it("delete matched key start", () => {
    const cache = new MemoryStore({ namespace: "tester" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/^fo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
  });

  it("delete matched key", () => {
    const cache = new MemoryStore({ namespace: "foo" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/OO/i);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
  });
});
