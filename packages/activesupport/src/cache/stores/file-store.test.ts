import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { FileStore, FILENAME_MAX_SIZE } from "../file-store.js";
import { assert, assertEmpty, assertNot, assertPredicate } from "../../testing/assertions.js";
import { Store } from "../store.js";
import { getFs } from "../../fs-adapter.js";
import { isPresent } from "../../core-ext/object/blank.js";
import { cacheInstrumentationBehavior } from "../behaviors/cache-instrumentation-behavior.js";
import { cacheStoreBehavior } from "../behaviors/cache-store-behavior.js";
import { cacheDeleteMatchedBehavior } from "../behaviors/cache-delete-matched-behavior.js";
import { cacheIncrementDecrementBehavior } from "../behaviors/cache-increment-decrement-behavior.js";
import { cacheStoreCoderBehavior } from "../behaviors/cache-store-coder-behavior.js";
import { cacheStoreCompressionBehavior } from "../behaviors/cache-store-compression-behavior.js";
import { cacheStoreSerializerBehavior } from "../behaviors/cache-store-serializer-behavior.js";
import type { StoreOptions } from "../store.js";
// Rails reaches the private path helper with `@cache.send(:normalize_key, key, {})`
// (file_store_test.rb:63).
function pathFor(store: FileStore, key: string): string {
  return (store as unknown as { normalizeKey(k: string, o: object): string }).normalizeKey(key, {});
}

// Rails reaches the private key helper with `@cache.send(:file_path_key, key)`
// (file_store_test.rb:64).
function filePathKey(store: FileStore, path: string): string {
  return (store as unknown as { filePathKey(p: string): string }).filePathKey(path);
}

describe("FileStoreTest", () => {
  let cacheDir: string;
  let store: FileStore;
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "file-store-"));
    store = new FileStore(cacheDir, { expiresIn: 60 });
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
    store.write("%".repeat(870), 1);
    expect(store.read("%".repeat(870))).toEqual(1);
  });

  it("key transformation", () => {
    const key = pathFor(store, "views/index?id=1");
    expect(filePathKey(store, key)).toEqual("views/index?id=1");
  });

  // Rails builds `@cache_with_pathname` from `Pathname.new(cache_dir)`
  // (file_store_test.rb:21); Ruby's Pathname is stdlib with no trails
  // counterpart, so the store is built from the same directory as a String and
  // the round-trip through `file_path_key` is what the test pins.
  it("key transformation with pathname", () => {
    writeFileSync(join(cacheDir, "foo"), "");
    const cacheWithPathname = new FileStore(cacheDir, { expiresIn: 60 });
    const key = pathFor(cacheWithPathname, "views/index?id=1");
    expect(filePathKey(cacheWithPathname, key)).toEqual("views/index?id=1");
  });

  // Test that generated cache keys are short enough to have Tempfile stuff added to them and
  // remain valid
  it("filename max size", () => {
    const key = "A".repeat(FILENAME_MAX_SIZE);
    // Ruby reads the name Tempfile would pick out of `Dir::Tmpname.create`
    // (file_store_test.rb:80); trails' atomicWrite picks its own, so the name
    // under test is the one the real write hands to writeFileSync.
    const writeFileSync = vi.spyOn(getFs(), "writeFileSync");
    let tmpname: string;
    try {
      store.write(key, "v");
      tmpname = basename(String(writeFileSync.mock.calls[0][0]));
    } finally {
      writeFileSync.mockRestore();
    }
    assert(
      basename(`${tmpname}.lock`).length <= 255,
      `Temp filename too long: ${basename(`${tmpname}.lock`).length}`,
    );
  });

  // Because file systems have a maximum filename size, filenames > max size should be split in to directories
  // If filename is 'AAAAB', where max size is 4, the returned path should be AAAA/B
  it("key transformation max filename size", () => {
    const key = `${"A".repeat(FILENAME_MAX_SIZE)}B`;
    const path = pathFor(store, key);
    assert(path.split("/").every((dirName) => dirName.length <= FILENAME_MAX_SIZE));
    expect(basename(path)).toEqual("B");
  });

  it("delete matched when key exceeds max filename size", () => {
    const submaximalKey = "_".repeat(FILENAME_MAX_SIZE - 1);

    store.write(submaximalKey + "AB", "value");
    store.deleteMatched(/AB/);
    assertNot(store.exist(submaximalKey + "AB"));

    store.write(submaximalKey + "/A", "value");
    store.deleteMatched(/A/);
    assertNot(store.exist(submaximalKey + "/A"));
  });

  it("delete matched when cache directory does not exist", () => {
    const nonExistent = new FileStore("/tmp/does_not_exist_rails_ts_test_" + Date.now());
    expect(() => nonExistent.deleteMatched(/does_not_exist/)).not.toThrow();
  });

  it("delete does not delete empty parent dir", () => {
    const subCacheDir = join(cacheDir, "subdir/");
    const subCacheStore = new FileStore(subCacheDir);
    expect(() => {
      assert(subCacheStore.write("foo", "bar"));
      assert(subCacheStore.delete("foo"));
    }).not.toThrow();
    assert(existsSync(cacheDir), "Parent of top level cache dir was deleted!");
    assert(existsSync(subCacheDir), "Top level cache dir was deleted!");
    assertEmpty(readdirSync(subCacheDir));
  });

  it("delete prunes empty parent directories", () => {
    const entryDir = dirname(pathFor(store, "a/b"));
    store.write("a/b", "val");
    expect(existsSync(entryDir)).toBe(true);
    store.delete("a/b");
    expect(existsSync(entryDir)).toBe(false);
    expect(existsSync(cacheDir)).toBe(true);
  });

  it("delete prunes empty directories up to a symlinked cache dir", () => {
    // Rails delete_empty_directories compares File.realpath(dir) ==
    // File.realpath(cache_path) (file_store.rb:195) so a symlinked cacheDir
    // still stops the recursion at the real cache dir. A lexical resolve would
    // mis-compare the symlink path against its target and recurse past it.
    const realRoot = mkdtempSync(join(tmpdir(), "file-store-real-"));
    const linkRoot = join(mkdtempSync(join(tmpdir(), "file-store-link-")), "cache");
    symlinkSync(realRoot, linkRoot, "dir");
    try {
      const linkStore = new FileStore(linkRoot, { expiresIn: 60 });
      const entryDir = dirname(pathFor(linkStore, "a/b"));
      linkStore.write("a/b", "val");
      expect(existsSync(entryDir)).toBe(true);
      linkStore.delete("a/b");
      expect(existsSync(entryDir)).toBe(false);
      // The real cache dir (reached through the symlink) survives the recursion.
      expect(existsSync(realRoot)).toBe(true);
      expect(existsSync(linkRoot)).toBe(true);
    } finally {
      rmSync(linkRoot, { force: true });
      rmSync(realpathSync(realRoot), { recursive: true, force: true });
    }
  });

  it("log exception when cache read fails", () => {
    // Rails' `@buffer = StringIO.new` + `@cache.logger = Logger.new(@buffer)`
    // (file_store_test.rb:23-24); the logger is class-level in trails.
    const buffer = { string: "" };
    const previousLogger = Store.logger;
    Store.logger = {
      warn: (message: string) => (buffer.string += message),
      error: (message: string) => (buffer.string += message),
    };
    // Rails' `File.stub(:exist?, -> { raise StandardError.new("failed") })`
    // (file_store_test.rb:127).
    const existsSync = vi.spyOn(getFs(), "existsSync").mockImplementation(() => {
      throw new Error("failed");
    });
    try {
      (store as unknown as { readEntry(k: string, o: object): unknown }).readEntry("winston", {});
      assertPredicate(buffer.string, isPresent);
    } finally {
      existsSync.mockRestore();
      Store.logger = previousLogger;
    }
  });

  it("cleanup removes all expired entries", () => {
    const time = Date.now();
    store.write("foo", "bar", { expiresIn: 10 });
    store.write("baz", "qux");
    store.write("quux", "corge", { expiresIn: 20 });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(time + 15_000);
      store.cleanup();
      assertNot(store.exist("foo"));
      assert(store.exist("baz"));
      assert(store.exist("quux"));
      expect(readdirSync(cacheDir).length).toEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanup when non active support cache file exists", () => {
    const cacheFilePath = pathFor(store, "foo");
    mkdirSync(dirname(cacheFilePath), { recursive: true });
    writeFileSync(cacheFilePath, cacheDir);
    expect(() => store.cleanup()).not.toThrow();
    expect(readdirSync(cacheDir).length).toEqual(1);
  });

  it("write with unless exist", () => {
    expect(store.write("1", "aaaaaaaaaa")).toEqual(true);
    expect(store.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
    store.write("1", null);
    expect(store.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
  });

  it("clear", () => {
    const gitkeep = join(cacheDir, ".gitkeep");
    const keep = join(cacheDir, ".keep");
    writeFileSync(gitkeep, "");
    writeFileSync(keep, "");
    store.clear();
    assert(existsSync(gitkeep));
    assert(existsSync(keep));
  });

  // Inherited Store#fetch_multi routes through the readEntry hook, which must
  // reconstruct the stored expiry so an expired entry is a miss + regenerate
  // (cache.rb read_multi_entries -> read_entry). Without expiry round-trip the
  // reconstructed Entry would look fresh and serve stale data.
  it("fetch_multi honors entry expiration", async () => {
    store.write("foo", "old", { expiresIn: 0.01 });
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

  // Mirrors `include CacheStoreBehavior` (file_store_test.rb:32).
  cacheStoreBehavior({ lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options) });

  // Mirrors `include CacheStoreCoderBehavior` (file_store_test.rb:34).
  cacheStoreCoderBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  // Mirrors `include CacheStoreCompressionBehavior` (file_store_test.rb:35).
  cacheStoreCompressionBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  // Mirrors `include CacheStoreSerializerBehavior` (file_store_test.rb:36).
  cacheStoreSerializerBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  // Mirrors `include CacheDeleteMatchedBehavior` (file_store_test.rb:38).
  cacheDeleteMatchedBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  // Mirrors `include CacheIncrementDecrementBehavior` (file_store_test.rb:39).
  cacheIncrementDecrementBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  // Mirrors `include CacheInstrumentationBehavior` (file_store_test.rb:40).
  cacheInstrumentationBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
    storeName: "FileStore",
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

describe("FileStore increment/decrement amount coercion", () => {
  let cacheDir: string;
  let cache: FileStore;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "file-store-"));
    cache = new FileStore(cacheDir);
  });

  afterEach(() => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  // Rails coerces `amount = Integer(amount)` (file_store.rb:226), which raises
  // FloatDomainError on NaN/Infinity rather than seeding a non-integer entry.
  it("increment raises on a non-integer amount when seeding a missing key", () => {
    expect(() => cache.increment("foo", NaN)).toThrow();
    expect(() => cache.increment("foo", Infinity)).toThrow();
    expect(() => cache.increment("foo", -Infinity)).toThrow();
    expect(cache.read("foo")).toBeNull();
  });

  it("decrement raises on a non-integer amount when seeding a missing key", () => {
    expect(() => cache.decrement("foo", NaN)).toThrow();
    expect(() => cache.decrement("foo", Infinity)).toThrow();
    expect(cache.read("foo")).toBeNull();
  });

  // Rails coerces once, so the seed write, the return value, and the hit-path
  // addition all use `Integer(amount)` — a finite float truncates toward zero.
  it("increment truncates a finite float amount toward zero", () => {
    expect(cache.increment("frac", 1.9)).toBe(1);
    expect(Number(cache.read("frac"))).toBe(1);
    expect(cache.increment("frac", 2.9)).toBe(3);
    expect(Number(cache.read("frac"))).toBe(3);
  });
});
