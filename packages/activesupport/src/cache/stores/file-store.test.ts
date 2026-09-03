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
import { File } from "@blazetrails/ruby-compat";
import { isPresent } from "../../core-ext/object/blank.js";
import { cacheInstrumentationBehavior } from "../behaviors/cache-instrumentation-behavior.js";
import { cacheStoreBehavior } from "../behaviors/cache-store-behavior.js";
import { cacheDeleteMatchedBehavior } from "../behaviors/cache-delete-matched-behavior.js";
import { cacheIncrementDecrementBehavior } from "../behaviors/cache-increment-decrement-behavior.js";
import { cacheStoreCoderBehavior } from "../behaviors/cache-store-coder-behavior.js";
import { cacheStoreCompressionBehavior } from "../behaviors/cache-store-compression-behavior.js";
import { cacheStoreSerializerBehavior } from "../behaviors/cache-store-serializer-behavior.js";
import type { StoreOptions } from "../store.js";
function pathFor(store: FileStore, key: string): string {
  return (store as unknown as { normalizeKey(k: string, o: object): string }).normalizeKey(key, {});
}

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

  it("key transformation with pathname", () => {
    writeFileSync(join(cacheDir, "foo"), "");
    const cacheWithPathname = new FileStore(cacheDir, { expiresIn: 60 });
    const key = pathFor(cacheWithPathname, "views/index?id=1");
    expect(filePathKey(cacheWithPathname, key)).toEqual("views/index?id=1");
  });

  it("filename max size", () => {
    const key = "A".repeat(FILENAME_MAX_SIZE);
    const open = vi.spyOn(File, "open");
    let tmpname: string;
    try {
      store.write(key, "v");
      tmpname = basename(String(open.mock.calls[0][0]));
    } finally {
      open.mockRestore();
    }
    assert(
      basename(`${tmpname}.lock`).length <= 255,
      `Temp filename too long: ${basename(`${tmpname}.lock`).length}`,
    );
  });

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
      expect(existsSync(realRoot)).toBe(true);
      expect(existsSync(linkRoot)).toBe(true);
    } finally {
      rmSync(linkRoot, { force: true });
      rmSync(realpathSync(realRoot), { recursive: true, force: true });
    }
  });

  it("log exception when cache read fails", () => {
    const buffer = { string: "" };
    const previousLogger = Store.logger;
    Store.logger = {
      warn: (message: string) => (buffer.string += message),
      error: (message: string) => (buffer.string += message),
    };
    const isExist = vi.spyOn(File, "isExist").mockImplementation(() => {
      throw new Error("failed");
    });
    try {
      (store as unknown as { readEntry(k: string, o: object): unknown }).readEntry("winston", {});
      assertPredicate(buffer.string, isPresent);
    } finally {
      isExist.mockRestore();
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

  it("fetch_multi honors entry expiration", async () => {
    store.write("foo", "old", { expiresIn: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    const result = store.fetchMulti("foo", "bar", (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated", bar: "bar-generated" });
    expect(store.read("foo")).toBe("foo-generated");
  });

  it("fetch_multi honors version mismatch", () => {
    store.write("foo", "old", { version: "v1" });
    const result = store.fetchMulti("foo", { version: "v2" }, (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated" });
  });

  cacheStoreBehavior({ lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options) });

  cacheStoreCoderBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  cacheStoreCompressionBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  cacheStoreSerializerBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  cacheDeleteMatchedBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

  cacheIncrementDecrementBehavior({
    lookupStore: (options?: StoreOptions) => new FileStore(cacheDir, options),
  });

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

  it("increment truncates a finite float amount toward zero", () => {
    expect(cache.increment("frac", 1.9)).toBe(1);
    expect(Number(cache.read("frac"))).toBe(1);
    expect(cache.increment("frac", 2.9)).toBe(3);
    expect(Number(cache.read("frac"))).toBe(3);
  });
});
