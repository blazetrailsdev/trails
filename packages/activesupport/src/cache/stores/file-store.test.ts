import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../file-store.js";
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

  // Inherited Store#fetch_multi routes through the readEntry hook, which must
  // reconstruct the stored expiry so an expired entry is a miss + regenerate
  // (cache.rb read_multi_entries -> read_entry). Without expiry round-trip the
  // reconstructed Entry would look fresh and serve stale data.
  it("fetch_multi honors entry expiration", async () => {
    store.write("foo", "old", { expiresIn: 10 });
    await new Promise((r) => setTimeout(r, 20));
    const result = store.fetchMulti("foo", "bar", (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated", bar: "bar-generated" });
    expect(store.read("foo")).toBe("foo-generated");
  });

  // The persisted version must round-trip through readEntry so the inherited
  // readMultiEntries' isMismatched check fires (cache.rb), making a version
  // mismatch a miss + regenerate.
  it("fetch_multi honors version mismatch", () => {
    store.write("foo", "old", { version: "v1" });
    const result = store.fetchMulti("foo", { version: "v2" }, (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated" });
  });
});

describe("FileStore coder fidelity", () => {
  let cacheDir: string;
  let store: FileStore;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "file-store-coder-"));
    store = new FileStore(cacheDir);
  });

  afterEach(() => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it("round-trips Date values", () => {
    const date = new Date("2026-06-19T14:36:26.123Z");
    store.write("d", date);
    const result = store.read("d");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(date.getTime());
  });

  it("round-trips undefined distinct from null", () => {
    store.write("u", undefined);
    expect(store.read("u")).toBeUndefined();
    store.write("n", null);
    expect(store.read("n")).toBeNull();
  });

  it("round-trips bigint values", () => {
    store.write("b", 9007199254740993n);
    expect(store.read("b")).toBe(9007199254740993n);
  });

  it("round-trips non-finite numbers", () => {
    store.write("nan", NaN);
    expect(store.read("nan")).toBeNaN();
    store.write("inf", Infinity);
    expect(store.read("inf")).toBe(Infinity);
  });
});
