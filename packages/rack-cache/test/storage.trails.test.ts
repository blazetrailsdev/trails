import { describe, it, expect, vi } from "vitest";
import { Storage } from "../lib/storage.js";

describe("Rack::Cache::Storage", () => {
  it("answers one store to concurrent first resolves of a URI", async () => {
    const storage = new Storage();
    const [a, b] = await Promise.all([
      storage.resolveMetastoreUri("heap:/"),
      storage.resolveMetastoreUri("heap:/"),
    ]);
    expect(a).toBe(b);
  });

  it("memoizes nothing when creating the store raises", async () => {
    const storage = new Storage();
    const createStore = vi.spyOn(storage as unknown as { createStore(): unknown }, "createStore");
    await expect(storage.resolveEntitystoreUri("foo:/")).rejects.toThrow();
    await expect(storage.resolveEntitystoreUri("foo:/")).rejects.toThrow();
    expect(createStore).toHaveBeenCalledTimes(2);
  });
});
