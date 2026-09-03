import { describe, it, expect } from "vitest";
import { MemoryStore } from "./memory-store.js";
import type { Entry } from "./entry.js";
import { assert, assertNot } from "../testing/assertions.js";

function rawValue(cache: MemoryStore, key: string): unknown {
  const data = (cache as unknown as { data: Map<string, Entry> }).data;
  return data.get(key)?.value;
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
    assertNot(cache.exist("foo"));
    assert(cache.exist("fu"));
  });

  it("delete matched key", () => {
    const cache = new MemoryStore({ namespace: "foo" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/OO/i);
    assertNot(cache.exist("foo"));
    assert(cache.exist("fu"));
  });
});
