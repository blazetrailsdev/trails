import { assertQueriesCount } from "@blazetrails/activerecord/testing/query-assertions";
import { stubConst } from "@blazetrails/activesupport/testing/constant-stubbing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Entry, SolidCache } from "../../../lib/index.js";
import { useSolidCache } from "../../support/test-helper.js";

describe("SolidCache::EntryTest", () => {
  useSolidCache();

  afterEach(() => vi.restoreAllMocks());

  it("write and read cache entries", async () => {
    await Entry.write("hello", "there");
    expect(utf8(await Entry.read("hello"))).toBe("there");
  });

  it("write multi and read multi cache entries", async () => {
    await Entry.writeMulti([
      { key: "hello", value: "there" },
      { key: "foo", value: "bar" },
    ]);
    expect(utf8Hash(await Entry.readMulti(["hello", "foo", "bar"]))).toEqual({
      foo: "bar",
      hello: "there",
    });
  });

  it("id range", async () => {
    expect(Number(await Entry.idRange())).toBe(0);

    await Entry.write("hello", "there");
    await Entry.write("hello2", "there");

    expect(Number(await Entry.uncached(() => Entry.idRange()))).toBe(2);
  });

  it("clear with truncate", async () => {
    await writeEntries();
    expect(await uncachedEntryCount()).toBe(20);
    await Entry.clearTruncate();
    expect(await uncachedEntryCount()).toBe(0);
  });

  it("clear with delete", async () => {
    await writeEntries();
    expect(await uncachedEntryCount()).toBe(20);
    await Entry.clearDelete();
    expect(await uncachedEntryCount()).toBe(0);
  });

  it("handles key_hash collisions", async () => {
    const entry = Entry as unknown as { keyHashFor(key: unknown): number | bigint };
    const keyHashFor = entry.keyHashFor.bind(Entry);
    vi.spyOn(entry, "keyHashFor").mockImplementation((key) =>
      key === "hello" || key === "hi" ? 1 : keyHashFor(key),
    );

    await Entry.write("hello", "there");
    expect(utf8(await Entry.read("hello"))).toBe("there");
    expect(await Entry.read("hi")).toBeNull();
    expect(utf8Hash(await Entry.readMulti(["hello", "hi"]))).toEqual({ hello: "there" });

    await Entry.write("hi", "now");
    expect(await Entry.read("hello")).toBeNull();
    expect(utf8(await Entry.read("hi"))).toBe("now");
    expect(utf8Hash(await Entry.readMulti(["hello", "hi"]))).toEqual({ hi: "now" });
  });

  it("byte_size", async () => {
    const byteSize = () =>
      Entry.uncached(async () => (await Entry.last())!.readAttribute("byte_size"));
    const encrypted = SolidCache.configuration.isEncrypt();
    await Entry.write("hello", "test");
    expect(await byteSize()).toBe(encrypted ? 319 : 149);
    await Entry.write("hello", "12345");
    expect(await byteSize()).toBe(encrypted ? 320 : 150);
    await Entry.write("hi", "12345");
    expect(await byteSize()).toBe(encrypted ? 317 : 147);
  });

  it("batching multi queries", async () => {
    await stubConst(Entry as never, "MULTI_BATCH_SIZE", 2, async () => {
      await assertQueriesCount(2, false, () =>
        Entry.writeMulti([
          { key: "hello", value: "there" },
          { key: "foo", value: "bar" },
          { key: "baz", value: "zab" },
        ]),
      );

      await assertQueriesCount(2, false, async () => {
        expect(utf8Hash(await Entry.readMulti(["hello", "foo", "baz", "bar"]))).toEqual({
          foo: "bar",
          hello: "there",
          baz: "zab",
        });
      });
    });
  });

  function utf8(value: unknown): unknown {
    return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
  }

  function utf8Hash(results: Map<string, unknown>): Record<string, unknown> {
    return Object.fromEntries([...results].map(([key, value]) => [key, utf8(value)]));
  }

  async function writeEntries(count = 20): Promise<void> {
    await Entry.writeMulti(
      Array.from({ length: count }, (_, i) => ({ key: `key${i}`, value: `value${i}` })),
    );
  }

  async function uncachedEntryCount(): Promise<number> {
    return await Entry.uncached(() => Entry.count());
  }
});
