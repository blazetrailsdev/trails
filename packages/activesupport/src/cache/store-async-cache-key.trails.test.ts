import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store.js";

const relation = {
  cacheKey: async () => "projects/query-abc",
  cacheVersion: async () => "2-20261025",
};

describe("Store async cache keys", () => {
  it("awaits a cache key and version nested in an array name", async () => {
    const cache = new MemoryStore();
    await cache.write(["views", ["post/1", relation]], "fragment");
    expect(await cache.read("views/post/1/projects/query-abc", { version: "2-20261025" })).toBe(
      "fragment",
    );
    expect(await cache.read(["views", ["post/1", relation]])).toBe("fragment");
    expect(await cache.read("views/post/1/projects/query-abc", { version: "1" })).toBeNull();
  });
});
