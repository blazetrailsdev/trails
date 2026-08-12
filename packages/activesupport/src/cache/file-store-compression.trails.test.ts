import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "./file-store.js";
import type { CacheEntry } from "./entry-record.js";

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
    const path = (store as unknown as { keyToPath(k: string): string }).keyToPath(key);
    const record = (store as unknown as { readFile(p: string): CacheEntry }).readFile(path);
    return record.encodedValue;
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
