import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../stores.js";
describe("FileStoreTest", () => {
  let cacheDir: string;
  let store: FileStore;
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "file-store-"));
    store = new FileStore(cacheDir, { expiresIn: 60_000 });
  });
  afterEach(() => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it("clear without cache dir", () => {
    rmSync(cacheDir, { recursive: true, force: true });
    expect(() => store.clear()).not.toThrow();
  });

  it("long uri encoded keys", () => {
    const longKey = "a".repeat(300);
    store.write(longKey, "value");
    expect(store.read(longKey)).toBe("value");
  });

  it("key transformation", () => {
    store.write("my/key", "val");
    expect(store.read("my/key")).toBe("val");
  });

  it("key transformation with pathname", () => {
    store.write("path/to/key", "value");
    expect(store.read("path/to/key")).toBe("value");
  });

  it("filename max size", () => {
    // Keys with 228+ char segments should be stored without throwing
    const bigSegment = "x".repeat(250);
    expect(() => store.write(bigSegment, "v")).not.toThrow();
  });

  it("key transformation max filename size", () => {
    const bigKey = "x".repeat(500);
    store.write(bigKey, "v");
    expect(store.read(bigKey)).toBe("v");
  });

  it("delete matched when key exceeds max filename size", () => {
    const bigKey = "x".repeat(500);
    store.write(bigKey, "v");
    store.deleteMatched(/x{10}/);
    expect(store.read(bigKey)).toBeNull();
  });

  it("delete matched when cache directory does not exist", () => {
    const nonExistent = new FileStore("/tmp/does_not_exist_rails_ts_test_" + Date.now());
    expect(() => nonExistent.deleteMatched(/does_not_exist/)).not.toThrow();
  });

  it("delete does not delete empty parent dir", () => {
    store.write("a/b", "val");
    store.delete("a/b");
    expect(existsSync(cacheDir)).toBe(true);
  });

  it("log exception when cache read fails", () => {
    // Corrupted cache files should return null gracefully
    expect(store.read("nonexistent_key")).toBeNull();
  });

  it("cleanup removes all expired entries", async () => {
    store.write("foo", "bar", { expiresIn: 10 });
    store.write("baz", "qux");
    await new Promise((r) => setTimeout(r, 20));
    store.cleanup();
    expect(store.exist("foo")).toBe(false);
    expect(store.exist("baz")).toBe(true);
  });

  it("cleanup when non active support cache file exists", () => {
    // Non-JSON files in cache dir should not cause errors during cleanup
    writeFileSync(join(cacheDir, "not_a_cache_file.txt"), "plain text");
    expect(() => store.cleanup()).not.toThrow();
  });

  it("write with unless exist", () => {
    store.write("1", "aaaaaaaaaa");
    expect(store.write("1", "aaaaaaaaaa", { unlessExist: true })).toBe(false);
    expect(store.write("new_k", "val", { unlessExist: true })).toBe(true);
  });

  it("clear", () => {
    writeFileSync(join(cacheDir, ".gitkeep"), "");
    writeFileSync(join(cacheDir, ".keep"), "");
    store.write("foo", "bar");
    store.clear();
    expect(existsSync(join(cacheDir, ".gitkeep"))).toBe(true);
    expect(existsSync(join(cacheDir, ".keep"))).toBe(true);
    expect(store.read("foo")).toBeNull();
  });
});
