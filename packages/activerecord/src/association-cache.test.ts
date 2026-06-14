import { describe, expect, it } from "vitest";
import { createAssociationCache } from "./association-cache.js";

describe("association cache fold", () => {
  it("exposes three independent facets over one backing store", () => {
    const cache = createAssociationCache();
    cache.instances.set("posts", { kind: "instance" });
    cache.proxies.set("posts", { kind: "proxy" });
    cache.preloaded.set("posts", { kind: "preloaded" });

    // One backing slot per name.
    expect(cache.store.size).toBe(1);
    expect(cache.instances.get("posts")).toEqual({ kind: "instance" });
    expect(cache.proxies.get("posts")).toEqual({ kind: "proxy" });
    expect(cache.preloaded.get("posts")).toEqual({ kind: "preloaded" });
  });

  it("distinguishes a preloaded-nil from absent", () => {
    const cache = createAssociationCache();
    cache.preloaded.set("author", null);
    expect(cache.preloaded.has("author")).toBe(true);
    expect(cache.preloaded.get("author")).toBeNull();
    expect(cache.preloaded.has("editor")).toBe(false);
  });

  it("facet has/get/delete scope to that facet only", () => {
    const cache = createAssociationCache();
    cache.instances.set("a", 1);
    expect(cache.proxies.has("a")).toBe(false);
    expect(cache.instances.delete("a")).toBe(true);
    expect(cache.instances.has("a")).toBe(false);
    expect(cache.instances.delete("a")).toBe(false);
    // Slot dropped once empty.
    expect(cache.store.size).toBe(0);
  });

  it("clear() resets every facet at once", () => {
    const cache = createAssociationCache();
    cache.instances.set("a", 1);
    cache.proxies.set("b", 2);
    cache.preloaded.set("c", null);
    cache.clear();
    expect(cache.store.size).toBe(0);
    expect(cache.instances.has("a")).toBe(false);
    expect(cache.proxies.has("b")).toBe(false);
    expect(cache.preloaded.has("c")).toBe(false);
  });

  it("iterates keys/entries/values for its facet", () => {
    const cache = createAssociationCache();
    cache.instances.set("a", 1);
    cache.instances.set("b", 2);
    cache.proxies.set("c", 3);
    expect([...cache.instances.keys()].sort()).toEqual(["a", "b"]);
    expect([...cache.instances.values()].sort()).toEqual([1, 2]);
    expect(new Map(cache.instances.entries()).get("b")).toBe(2);
    expect(cache.instances.size).toBe(2);
    const seen: Array<[string, unknown]> = [];
    for (const [k, v] of cache.instances) seen.push([k, v]);
    expect(seen.length).toBe(2);
  });
});
