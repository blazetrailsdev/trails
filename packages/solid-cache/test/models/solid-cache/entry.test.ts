import { assertQueriesCount } from "@blazetrails/activerecord/testing/query-assertions";
import { stubConst } from "@blazetrails/activesupport/testing/constant-stubbing";
import { b, rbEqual } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Entry, SolidCache } from "../../../lib/index.js";
import { useSolidCache } from "../../support/test-helper.js";

describe("EntryTest", () => {
  useSolidCache();

  afterEach(() => vi.restoreAllMocks());

  it("write and read cache entries", async () => {
    await Entry.write(b("hello"), "there");
    expect(utf8(await Entry.read(b("hello")))).toBe("there");
  });

  it("write multi and read multi cache entries", async () => {
    await Entry.writeMulti([
      { key: b("hello"), value: "there" },
      { key: b("foo"), value: "bar" },
    ]);
    expect(utf8Hash(await Entry.readMulti([b("hello"), b("foo"), b("bar")]))).toEqual({
      foo: "bar",
      hello: "there",
    });
  });

  it("id range", async () => {
    expect(Number(await Entry.idRange())).toBe(0);

    await Entry.write(b("hello"), "there");
    await Entry.write(b("hello2"), "there");

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
      rbEqual(key, b("hello")) || rbEqual(key, b("hi")) ? 1 : keyHashFor(key),
    );

    await Entry.write(b("hello"), "there");
    expect(utf8(await Entry.read(b("hello")))).toBe("there");
    expect(await Entry.read(b("hi"))).toBeNull();
    expect(utf8Hash(await Entry.readMulti([b("hello"), b("hi")]))).toEqual({ hello: "there" });

    await Entry.write(b("hi"), "now");
    expect(await Entry.read(b("hello"))).toBeNull();
    expect(utf8(await Entry.read(b("hi")))).toBe("now");
    expect(utf8Hash(await Entry.readMulti([b("hello"), b("hi")]))).toEqual({ hi: "now" });
  });

  it("byte_size", async () => {
    const byteSize = () =>
      Entry.uncached(async () => (await Entry.last())!.readAttribute("byte_size"));
    await verifyByteSizes(byteSize);
  });

  it("batching multi queries", async () => {
    await stubConst(Entry as never, "MULTI_BATCH_SIZE", 2, async () => {
      await assertQueriesCount(2, () =>
        Entry.writeMulti([
          { key: b("hello"), value: "there" },
          { key: b("foo"), value: "bar" },
          { key: b("baz"), value: "zab" },
        ]),
      );

      await assertQueriesCount(2, async () => {
        expect(utf8Hash(await Entry.readMulti([b("hello"), b("foo"), b("baz"), b("bar")]))).toEqual(
          {
            foo: "bar",
            hello: "there",
            baz: "zab",
          },
        );
      });
    });
  });

  async function verifyByteSizes(byteSize: () => unknown): Promise<void> {
    if (SolidCache.configuration.isEncrypt()) {
      await Entry.write(b("hello"), "test");
      expect(await byteSize()).toBe(319);
      await Entry.write(b("hello"), "12345");
      expect(await byteSize()).toBe(320);
      await Entry.write(b("hi"), "12345");
      expect(await byteSize()).toBe(317);
    } else {
      await Entry.write(b("hello"), "test");
      expect(await byteSize()).toBe(149);
      await Entry.write(b("hello"), "12345");
      expect(await byteSize()).toBe(150);
      await Entry.write(b("hi"), "12345");
      expect(await byteSize()).toBe(147);
    }
  }

  function utf8(value: unknown): unknown {
    return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
  }

  function utf8Hash(results: Map<unknown, unknown>): Record<string, unknown> {
    return Object.fromEntries([...results].map(([key, value]) => [utf8(key), utf8(value)]));
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
