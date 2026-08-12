import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "./file-store.js";

// trails-only coverage for FileStore's `serialize_entry` compression branch
// (cache.rb:806-813). Rails covers it through the shared
// `CacheStoreCompressionBehavior` suite, which trails has not enrolled yet.
describe("FileStore compression", () => {
  function withStore(options: Record<string, unknown>, fn: (store: FileStore) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "trails-file-store-"));
    try {
      fn(new FileStore(dir, options));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function storedPayload(store: FileStore, key: string): string {
    const internals = store as unknown as {
      normalizeKey(k: string, o: object): string;
      readSerializedEntry(k: string): string;
    };
    return internals.readSerializedEntry(internals.normalizeKey(key, {}));
  }

  it("compresses a large value by default and reads it back intact", () => {
    withStore({}, (store) => {
      const value = "a".repeat(4096);
      store.write("foo", value);
      expect(storedPayload(store, "foo").length).toBeLessThan(value.length);
      expect(store.read("foo")).toBe(value);
    });
  });

  it("stores the value uncompressed when compress is false", () => {
    withStore({ compress: false }, (store) => {
      const value = "a".repeat(4096);
      store.write("foo", value);
      expect(storedPayload(store, "foo").length).toBeGreaterThan(value.length);
      expect(store.read("foo")).toBe(value);
    });
  });
});
