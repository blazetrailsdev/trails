import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./cache/memory-store.js";
import { Entry } from "./cache/entry.js";
import { NullStore } from "./cache/null-store.js";
import { FileStore } from "./cache/file-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNil } from "./testing/assertions.js";

describe("MemoryStoreTest", () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore({ expiresIn: 60 });
  });

  it("read and write", async () => {
    await store.write("key", "value");
    expect(await store.read("key")).toBe("value");
  });

  it("read miss returns null", async () => {
    expect(await store.read("missing")).toBeNull();
  });

  it("write returns true", async () => {
    expect(await store.write("key", "value")).toBe(true);
  });

  it("delete removes the entry", async () => {
    await store.write("key", "value");
    await store.delete("key");
    expect(await store.read("key")).toBeNull();
  });

  it("exist returns true when key present", async () => {
    await store.write("key", "value");
    expect(await store.exist("key")).toBe(true);
  });

  it("exist returns false when key absent", async () => {
    expect(await store.exist("missing")).toBe(false);
  });

  it("fetch returns cached value when present", async () => {
    await store.write("key", "value");
    expect(await store.fetch("key", () => "fallback")).toBe("value");
  });

  it("fetch computes and stores value on miss", async () => {
    const result = await store.fetch("key", () => "computed");
    expect(result).toBe("computed");
    expect(await store.read("key")).toBe("computed");
  });

  it("clear removes all entries", async () => {
    await store.write("a", 1);
    await store.write("b", 2);
    await store.clear();
    expect(await store.read("a")).toBeNull();
    expect(await store.read("b")).toBeNull();
  });

  it("readMulti returns present keys", async () => {
    await store.write("a", 1);
    await store.write("b", 2);
    const result = await store.readMulti("a", "b", "c");
    expect(Object.fromEntries(result)).toEqual({ a: 1, b: 2 });
  });

  it("readMulti applies trailing namespace option", async () => {
    await store.write("a", 1, { namespace: "tester" });
    await store.write("b", 2, { namespace: "tester" });
    expect(Object.fromEntries(await store.readMulti("a", "b", { namespace: "tester" }))).toEqual({
      a: 1,
      b: 2,
    });
    expect(Object.fromEntries(await store.readMulti("a", "b"))).toEqual({});
  });

  it("writeMulti writes multiple keys", async () => {
    await store.writeMulti({ x: 10, y: 20 });
    expect(await store.read("x")).toBe(10);
    expect(await store.read("y")).toBe(20);
  });

  it("increment increases integer value", async () => {
    await store.write("counter", 5);
    const result = await store.increment("counter");
    expect(result).toBe(6);
  });

  it("decrement decreases integer value", async () => {
    await store.write("counter", 5);
    const result = await store.decrement("counter");
    expect(result).toBe(4);
  });

  it("increment creates a missing key set to amount", async () => {
    expect(await store.increment("missing")).toBe(1);
    expect(await store.read("missing")).toBe(1);
    expect(await store.increment("other", 100)).toBe(100);
  });

  it("expiry: entry not readable after expiresIn", async () => {
    await store.write("tmp", "value", { expiresIn: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.read("tmp")).toBeNull();
  });

  it("namespace prefixes key", async () => {
    const ns = new MemoryStore({ namespace: "ns1" });
    await ns.write("key", "val");
    expect(await ns.read("key")).toBe("val");
    expect(await store.read("key")).toBeNull();
  });

  it("compress option accepted without error", async () => {
    await store.write("big", "a".repeat(1000), { compress: true });
    expect(await store.read("big")).toBe("a".repeat(1000));
  });

  it("deleteMatched removes matching keys", async () => {
    await store.write("foo_1", "a");
    await store.write("foo_2", "b");
    await store.write("bar_1", "c");
    await store.deleteMatched(/^foo/);
    expect(await store.read("foo_1")).toBeNull();
    expect(await store.read("foo_2")).toBeNull();
    expect(await store.read("bar_1")).toBe("c");
  });

  it("write with unlessExist: false if key exists", async () => {
    await store.write("k", "original");
    const result = await store.write("k", "new", { unlessExist: true });
    expect(result).toBe(false);
    expect(await store.read("k")).toBe("original");
  });

  it("write with unlessExist: true if key absent", async () => {
    const result = await store.write("new_k", "val", { unlessExist: true });
    expect(result).toBe(true);
  });

  it("namespaced write with unlessExist", async () => {
    const ns = new MemoryStore({ namespace: "foo", expiresIn: 60 });
    expect(await ns.write("1", "aaaaaaaaaa")).toBe(true);
    expect(await ns.write("1", "aaaaaaaaaa", { unlessExist: true })).toBe(false);
  });

  it("write expired value with unlessExist allows overwrite", async () => {
    await store.write("1", "aaaa", { expiresIn: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.write("1", "bbbb", { expiresIn: 0.1, unlessExist: true })).toBe(true);
  });

  it("cache is not mutated on read", async () => {
    const item = { foo: "bar" };
    await store.write("test_key", item);
    const read = (await store.read("test_key")) as { foo: string };
    read.foo = "xyz";
    expect(((await store.read("test_key")) as { foo: string }).foo).toBe("bar");
  });

  it("read returns different object ids (deep clone)", async () => {
    const item = { foo: "bar" };
    await store.write("test_key", item);
    const r1 = await store.read("test_key");
    const r2 = await store.read("test_key");
    expect(r1).not.toBe(r2);
    expect(r1).not.toBe(item);
  });
});

describe("MemoryStorePruningTest", () => {
  let recordSize: number;
  let store: MemoryStore;

  beforeEach(async () => {
    const probe = new MemoryStore() as unknown as {
      cachedSize(key: string, payload: Entry): number;
      serializeEntry(entry: Entry): Entry;
    };
    recordSize = probe.cachedSize(
      "1",
      probe.serializeEntry(new Entry("aaaaaaaaaa", { expiresIn: 60 })),
    );
    store = new MemoryStore({ expiresIn: 60, size: recordSize * 10 + 1 });
  });

  it("prune size evicts least recently used", async () => {
    await store.write("1", "aaaaaaaaaa");
    await store.write("2", "bbbbbbbbbb");
    await store.write("3", "cccccccccc");
    await store.write("4", "dddddddddd");
    await store.write("5", "eeeeeeeeee");
    await store.read("2");
    await store.read("4");
    await store.prune(recordSize * 3);
    expect(await store.exist("5")).toBe(true);
    expect(await store.exist("4")).toBe(true);
    expect(await store.exist("3")).toBe(false);
    expect(await store.exist("2")).toBe(true);
    expect(await store.exist("1")).toBe(false);
  });
});

describe("NullStoreTest", () => {
  let store: NullStore;

  beforeEach(async () => {
    store = new NullStore();
  });

  it("cleanup", async () => {
    await store.write("name", "value");
    await store.cleanup();
    assertNil(await store.read("name"));
  });

  it("write", async () => {
    expect(await store.write("name", "value")).toBe(true);
  });

  it("read", async () => {
    await store.write("name", "value");
    assertNil(await store.read("name"));
  });

  it("delete", async () => {
    await store.write("name", "value");
    expect(await store.delete("name")).toBe(false);
  });

  it("increment", async () => {
    await store.write("name", 1);
    assertNil(await store.increment("name"));
  });

  it("increment with options", async () => {
    expect(await store.increment("name", 1, { expiresIn: 1000 })).toBeNull();
    assertNil(await store.read("name"));
  });

  it("decrement", async () => {
    await store.write("name", 1);
    assertNil(await store.decrement("name"));
  });

  it("decrement with options", async () => {
    await store.write("name", 1);
    expect(await store.decrement("name", 1, { expiresIn: 1000 })).toBeNull();
    assertNil(await store.read("name"));
  });

  it("delete matched", async () => {
    await store.write("name", "value");
    await store.deleteMatched(/name/);
    assertNil(await store.read("name"));
  });

  it("local store strategy", async () => {
    assertNil(await store.read("foo"));
    await store.write("foo", "bar");
    assertNil(await store.read("foo"));
  });

  it("local store repeated reads", async () => {
    expect(await store.read("foo")).toBeNull();
    assertNil(await store.read("foo"));
  });
});

describe("FileStoreTest", () => {
  let cacheDir: string;
  let store: FileStore;

  beforeEach(async () => {
    cacheDir = mkdtempSync(join(tmpdir(), "file-store-"));
    store = new FileStore(cacheDir, { expiresIn: 60 });
  });

  afterEach(async () => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it("read and write", async () => {
    await store.write("key", "value");
    expect(await store.read("key")).toBe("value");
  });

  it("read miss returns null", async () => {
    expect(await store.read("missing")).toBeNull();
  });

  it("write returns true", async () => {
    expect(await store.write("key", "value")).toBe(true);
  });

  it("delete removes the entry", async () => {
    await store.write("key", "value");
    await store.delete("key");
    expect(await store.read("key")).toBeNull();
  });

  it("exist returns true when key present", async () => {
    await store.write("key", "value");
    expect(await store.exist("key")).toBe(true);
  });

  it("exist returns false when key absent", async () => {
    expect(await store.exist("missing")).toBe(false);
  });

  it("increment increases value", async () => {
    await store.write("counter", 5);
    expect(await store.increment("counter")).toBe(6);
  });

  it("decrement decreases value", async () => {
    await store.write("counter", 5);
    expect(await store.decrement("counter")).toBe(4);
  });

  it("increment creates a missing key set to amount", async () => {
    expect(await store.increment("missing")).toBe(1);
    expect(await store.read("missing")).toBe(1);
    expect(await store.increment("other", 100)).toBe(100);
  });

  it("readMulti returns present keys", async () => {
    await store.write("a", 1);
    await store.write("b", 2);
    const result = await store.readMulti("a", "b", "c");
    expect(Object.fromEntries(result)).toEqual({ a: 1, b: 2 });
  });

  it("readMulti applies trailing namespace option", async () => {
    await store.write("a", 1, { namespace: "tester" });
    await store.write("b", 2, { namespace: "tester" });
    expect(Object.fromEntries(await store.readMulti("a", "b", { namespace: "tester" }))).toEqual({
      a: 1,
      b: 2,
    });
    expect(Object.fromEntries(await store.readMulti("a", "b"))).toEqual({});
  });

  it("writeMulti writes multiple keys", async () => {
    await store.writeMulti({ x: 10, y: 20 });
    expect(await store.read("x")).toBe(10);
    expect(await store.read("y")).toBe(20);
  });

  it("expiry: entry not readable after expiresIn", async () => {
    await store.write("tmp", "value", { expiresIn: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.read("tmp")).toBeNull();
  });
});
