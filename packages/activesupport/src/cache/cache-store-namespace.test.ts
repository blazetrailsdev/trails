import { describe, it, expect } from "vitest";
import { MemoryStore } from "./memory-store.js";
import type { Entry } from "./entry.js";
import { assert, assertNot } from "../testing/assertions.js";

function rawValue(cache: MemoryStore, key: string): unknown {
  const data = (cache as unknown as { data: Map<string, Entry> }).data;
  return data.get(key)?.value;
}

describe("CacheStoreNamespaceTest", () => {
  it("static namespace", async () => {
    const cache = new MemoryStore({ namespace: "tester" });
    await cache.write("foo", "bar");
    expect(await cache.read("foo")).toBe("bar");
    expect(rawValue(cache, "tester:foo")).toBe("bar");
  });

  it("proc namespace", async () => {
    const testVal = "tester";
    const proc = () => testVal;
    const cache = new MemoryStore({ namespace: proc });
    await cache.write("foo", "bar");
    expect(await cache.read("foo")).toBe("bar");
    expect(rawValue(cache, "tester:foo")).toBe("bar");
  });

  it("delete matched key start", async () => {
    const cache = new MemoryStore({ namespace: "tester" });
    await cache.write("foo", "bar");
    await cache.write("fu", "baz");
    await cache.deleteMatched(/^fo/);
    assertNot(await cache.exist("foo"));
    assert(await cache.exist("fu"));
  });

  it("delete matched key", async () => {
    const cache = new MemoryStore({ namespace: "foo" });
    await cache.write("foo", "bar");
    await cache.write("fu", "baz");
    await cache.deleteMatched(/OO/i);
    assertNot(await cache.exist("foo"));
    assert(await cache.exist("fu"));
  });
});
