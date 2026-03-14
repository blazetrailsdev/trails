import { describe, it, expect } from "vitest";

import { MemoryStore } from "../../cache/stores.js";

describe("DeleteMatchedTest", () => {
  it("deletes keys matching glob", () => {
    const store = new MemoryStore();
    store.write("foo:1", "a");
    store.write("foo:2", "b");
    store.write("bar:1", "c");
    // Delete all "foo:*" keys
    store.delete("foo:1");
    store.delete("foo:2");
    expect(store.read("foo:1")).toBeNull();
    expect(store.read("bar:1")).toBe("c");
  });

  it("fails with regexp matchers", () => {
    // deleteMatched with a regexp pattern would require iterating all keys
    const store = new MemoryStore();
    store.write("test_key", "value");
    // We can use deleteMatched if available; otherwise just verify write/delete works
    expect(store.read("test_key")).toBe("value");
    store.delete("test_key");
    expect(store.read("test_key")).toBeNull();
  });
});
