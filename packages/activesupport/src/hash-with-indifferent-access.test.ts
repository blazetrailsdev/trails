import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import {
  Hash,
  KeyError,
  TypeError,
  rbInspect as inspect,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { assertRaises } from "./testing/assertions.js";
import { deepDup } from "./hash-utils.js";

const plainly = (hash: Hash<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    [...hash].map(([key, value]) => [key, value instanceof Hash ? plainly(value) : value]),
  );

describe("HashWithIndifferentAccessTest", () => {
  class IndifferentHash<V = unknown> extends HashWithIndifferentAccess<V> {}
  class SubclassingHash extends Hash<string, unknown> {}
  class NonIndifferentHash extends Hash<string, unknown> {
    nestedUnderIndifferentAccess(): this {
      return this;
    }
  }
  class HashByConversion {
    constructor(private hash: Record<string, unknown> | Hash<unknown, unknown>) {}
    toHash() {
      return this.hash;
    }
  }
  const hashOf = (entries: [unknown, unknown][]) => {
    const h = new Hash<unknown, unknown>();
    for (const [k, v] of entries) h.set(k, v);
    return h;
  };
  const wia = (h: unknown) => new HashWithIndifferentAccess<unknown>(h as never);
  const strings = () => ({ a: 1, b: 2 });
  const nestedStrings = () => ({ a: { b: { c: 3 } } });
  const symbols = () => ({ ":a": 1, ":b": 2 });
  const nestedSymbols = () => ({ ":a": { ":b": { ":c": 3 } } });
  const mixed = () => ({ ":a": 1, b: 2 });
  const nestedMixed = () => ({ a: { ":b": { c: 3 } } });
  const integers = () =>
    hashOf([
      [0, 1],
      [1, 2],
    ]);
  const nestedIntegers = () => hashOf([[0, hashOf([[1, hashOf([[2, 3]])]])]]);
  const illegalSymbols = () => hashOf([[[], 3]]);
  const nestedIllegalSymbols = () => hashOf([[[], hashOf([[[], 3]])]]);
  it("indifferent reading — string and symbol keys are interchangeable", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: true, c: false });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(true);
    expect(h.get("c")).toBe(false);
    expect(h.get("d")).toBeUndefined();
  });

  it("indifferent writing — set then retrieve with same key", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("a", 1);
    h.set("b", 2);
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("has — reports key presence", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.hasKey("a")).toBe(true);
    expect(h.hasKey("z")).toBe(false);
  });

  it("delete — removes key", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.delete("a")).toBe(1);
    expect(h.hasKey("a")).toBe(false);
    expect(h.delete("a")).toBeUndefined();
  });

  it("size — reports entry count", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.size).toBe(2);
    h.set("c", 3);
    expect(h.size).toBe(3);
  });

  it("indifferent merging — merge returns new HWIA", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "failure", b: "failure" });
    const other = { a: 1, b: 2 };
    const merged = h.merge(other);
    expect(merged).toBeInstanceOf(HashWithIndifferentAccess);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
    expect(h.get("a")).toBe("failure");
  });

  it("indifferent merging — merge with another HWIA", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = new HashWithIndifferentAccess({ b: 2 });
    const merged = h1.merge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("indifferent update — update mutates and returns self", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "old" });
    const returned = h.update({ a: 1, b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
    expect(returned).toBe(h);
  });

  it("update with multiple arguments", () => {
    const h = new HashWithIndifferentAccess<unknown>();
    h.update({ a: 1 }, { b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("indifferent select — returns new HWIA with matching pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select((_k, v) => v === 1);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(selected.toHash())).toEqual({ a: 1 });
  });

  it("indifferent select returns all when predicate always true", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.size).toBe(2);
  });

  it("indifferent reject — returns new HWIA excluding matching pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject((_k, v) => v !== 1);
    expect(rejected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(rejected.toHash())).toEqual({ a: 1 });
  });

  it("indifferent transform_keys — returns new HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformKeys((k) => k.repeat(2));
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(transformed.toHash())).toEqual({ aa: 1, bb: 2 });

    let hash = new HashWithIndifferentAccess({ a: 1, b: 2 }).transformKeys({ a: "x", y: "z" });
    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("x")).toBe(1);
    expect(hash.get("b")).toBe(2);
    expect(hash.get("z")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["x", "b"]);

    hash = new HashWithIndifferentAccess({ a: 1, b: 2 }).transformKeys({ a: "A", q: "Q" }, (k) =>
      k.repeat(3),
    );
    expect(hash.get("A")).toBe(1);
    expect(hash.get("bbb")).toBe(2);
    expect([...hash.keys()]).toEqual(["A", "bbb"]);

    expect(() => hash.transformKeys(null)).toThrow(/no implicit conversion of nil/);
  });

  it("indifferent transform_values — returns new HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformValues((v) => (v as number) * 2);
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(transformed.toHash())).toEqual({ a: 2, b: 4 });
  });

  it("indifferent compact — removes null/undefined values", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: null, c: undefined, d: 2 });
    const compacted = h.compact();
    expect(compacted).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(compacted.toHash())).toEqual({ a: 1, d: 2 });
    expect(h.hasKey("b")).toBe(true);
  });

  it("compact on hash with no nil values returns equivalent hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const compacted = h.compact();
    expect(Object.fromEntries(compacted.toHash())).toEqual({ a: 1, b: 2 });
  });

  it("indifferent assoc — returns [key, value] pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.assoc("a")).toEqual(["a", 1]);
    expect(h.assoc("z")).toBeUndefined();
  });

  it("nested dig indifferent access", () => {
    const data = new HashWithIndifferentAccess<unknown>({ this: { views: 1234 } });
    expect(data.dig(":this", ":views")).toBe(1234);
  });

  it("dig returns undefined for missing keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.dig("z")).toBeUndefined();
    expect(h.dig("z", "y")).toBeUndefined();
  });

  it("indifferent slice — returns HWIA with only given keys", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const sliced = original.slice("a", "b");
    expect(sliced).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(sliced.toHash())).toEqual({ a: "x", b: "y" });
    expect(original.size).toBe(3);
  });

  it("indifferent slice access — sliced value accessible by same key", () => {
    const original = new HashWithIndifferentAccess({
      login: "bender",
      password: "shiny",
      stuff: "foo",
    });
    const sliced = original.slice("login", "password");
    expect(sliced.get("login")).toBe("bender");
  });

  it("indifferent except — returns HWIA without given keys", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.except("a", "b");
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(result.toHash())).toEqual({ c: 10 });
    expect(original.size).toBe(3);
  });

  it("without — alias for except", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.without("a", "b");
    expect(Object.fromEntries(result.toHash())).toEqual({ c: 10 });
  });

  it("indifferent to_hash — converts to plain object with string keys", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });
    const plain = Object.fromEntries(h.toHash());
    expect(plain).toEqual({ a: 1, b: 2 });
    expect(plain).not.toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("any — true if any entries exist", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.any()).toBe(true);
    const empty = new HashWithIndifferentAccess({});
    expect(empty.any()).toBe(false);
  });

  it("any — true if predicate matches at least one pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.any(([, v]) => (v as number) > 1)).toBe(true);
    expect(h.any(([, v]) => (v as number) > 99)).toBe(false);
  });

  it("all — true if predicate matches all pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.all(([, v]) => (v as number) > 0)).toBe(true);
    expect(h.all(([, v]) => (v as number) > 1)).toBe(false);
  });

  it("none — true if predicate matches no pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.none(([, v]) => (v as number) > 99)).toBe(true);
    expect(h.none(([, v]) => (v as number) > 1)).toBe(false);
  });

  it("count — counts all entries when no predicate", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.count()).toBe(2);
  });

  it("count with predicate — counts matching entries", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    expect(h.count(([, v]) => (v as number) > 1)).toBe(2);
  });

  it("find — returns first matching [key, value] pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const found = h.find(([, v]) => (v as number) === 2);
    expect(found).toEqual(["b", 2]);
    expect(h.find(([, v]) => (v as number) === 99)).toBeUndefined();
  });

  it("each — iterates key-value pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const result: [string, unknown][] = [];
    h.each((pair) => {
      result.push(pair);
    });
    expect(result).toContainEqual(["a", 1]);
    expect(result).toContainEqual(["b", 2]);
  });

  it("map — maps over entries returning array", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const result = h.map(([k, v]) => `${k}=${v}`);
    expect(result.sort()).toEqual(["a=1", "b=2"]);
  });

  it("invert — swaps keys and values", () => {
    const h = new HashWithIndifferentAccess({ a: "x", b: "y" });
    const inverted = h.invert();
    expect(inverted.get("x")).toBe("a");
    expect(inverted.get("y")).toBe("b");
  });

  it("store — alias for set", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  it("toParam — encodes to query string", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const param = h.toParam();
    expect(param).toContain("a=1");
    expect(param).toContain("b=2");
  });

  it("toQuery — encodes to query string (alias for toParam)", () => {
    const h = new HashWithIndifferentAccess({ hello: "world" });
    expect(h.toQuery()).toContain("hello=world");
  });

  it("deep_merge on indifferent access", () => {
    const h1 = new HashWithIndifferentAccess<unknown>({
      a: "a",
      b: "b",
      c: { c1: "c1", c2: "c2" },
    });
    const h2 = new HashWithIndifferentAccess<unknown>({ a: 1, c: { c1: 2 } });
    const merged = h1.deepMerge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe("b");
    expect((merged.get("c") as HashWithIndifferentAccess<unknown>).get("c1")).toBe(2);
    expect((merged.get("c") as HashWithIndifferentAccess<unknown>).get("c2")).toBe("c2");
  });

  it("replace — clears and repopulates hash", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 42 });
    h.replace({ b: 12 });
    expect(h.hasKey("a")).toBe(false);
    expect(h.get("b")).toBe(12);
  });

  it("indifferent sub-hashes — nested plain objects become HWIA on set", () => {
    const h = new HashWithIndifferentAccess<unknown>({ user: { id: 5 } });
    const user = h.get("user");
    expect(h.get("user")).toBeDefined();
  });

  it("withIndifferentAccess returns a new equivalent HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("to options for hash with indifferent access", () => {
    expect(wia(symbols()).toOptions()).toBeInstanceOf(Hash);
    expect(plainly(wia(symbols()).toOptions())).toEqual(symbols());
    expect(plainly(wia(strings()).toOptions())).toEqual(symbols());
    expect(plainly(wia(mixed()).toOptions())).toEqual(symbols());
  });

  it("deep symbolize keys for hash with indifferent access", () => {
    expect(wia(nestedSymbols()).deepSymbolizeKeys()).toBeInstanceOf(Hash);
    expect(plainly(wia(nestedSymbols()).deepSymbolizeKeys())).toEqual(nestedSymbols());
    expect(plainly(wia(nestedStrings()).deepSymbolizeKeys())).toEqual(nestedSymbols());
    expect(plainly(wia(nestedMixed()).deepSymbolizeKeys())).toEqual(nestedSymbols());
  });

  it("symbolize keys bang for hash with indifferent access", async () => {
    const symbolizeKeysBang = (h: unknown) =>
      (h as { symbolizeKeysBang(): unknown }).symbolizeKeysBang();
    await assertRaises([globalThis.TypeError], {}, () => symbolizeKeysBang(wia(symbols()).dup()));
    await assertRaises([globalThis.TypeError], {}, () => symbolizeKeysBang(wia(strings()).dup()));
    await assertRaises([globalThis.TypeError], {}, () => symbolizeKeysBang(wia(mixed()).dup()));
  });

  it("deep symbolize keys bang for hash with indifferent access", async () => {
    const deepSymbolizeKeysBang = (h: unknown) =>
      (h as { deepSymbolizeKeysBang(): unknown }).deepSymbolizeKeysBang();
    await assertRaises([globalThis.TypeError], {}, () =>
      deepSymbolizeKeysBang(deepDup(wia(nestedSymbols()))),
    );
    await assertRaises([globalThis.TypeError], {}, () =>
      deepSymbolizeKeysBang(deepDup(wia(nestedStrings()))),
    );
    await assertRaises([globalThis.TypeError], {}, () =>
      deepSymbolizeKeysBang(deepDup(wia(nestedMixed()))),
    );
  });

  it("symbolize keys preserves keys that cant be symbolized for hash with indifferent access", async () => {
    expect(wia(illegalSymbols()).symbolizeKeys()).toEqual(illegalSymbols());
    await assertRaises([globalThis.TypeError], {}, () =>
      ((h: unknown) => (h as { symbolizeKeysBang(): unknown }).symbolizeKeysBang())(
        wia(illegalSymbols()).dup(),
      ),
    );
  });

  it("deep symbolize keys preserves keys that cant be symbolized for hash with indifferent access", async () => {
    expect(wia(nestedIllegalSymbols()).deepSymbolizeKeys()).toEqual(nestedIllegalSymbols());
    await assertRaises([globalThis.TypeError], {}, () =>
      ((h: unknown) => (h as { deepSymbolizeKeysBang(): unknown }).deepSymbolizeKeysBang())(
        deepDup(wia(nestedIllegalSymbols())),
      ),
    );
  });

  it("symbolize keys preserves integer keys for hash with indifferent access", async () => {
    expect(wia(integers()).symbolizeKeys()).toEqual(integers());
    await assertRaises([globalThis.TypeError], {}, () =>
      ((h: unknown) => (h as { symbolizeKeysBang(): unknown }).symbolizeKeysBang())(
        wia(integers()).dup(),
      ),
    );
  });

  it("stringify keys stringifies integer keys for hash with indifferent access", () => {
    expect(plainly(wia(integers()).stringifyKeys())).toEqual({ "0": 1, "1": 2 });
    expect(plainly(wia({ ":ints": integers() }).deepStringifyKeys())).toEqual({
      ints: { "0": 1, "1": 2 },
    });
  });

  it("stringify keys stringifies non string keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep symbolize keys preserves integer keys for hash with indifferent access", async () => {
    expect(wia(nestedIntegers()).deepSymbolizeKeys()).toEqual(nestedIntegers());
    await assertRaises([globalThis.TypeError], {}, () =>
      ((h: unknown) => (h as { deepSymbolizeKeysBang(): unknown }).deepSymbolizeKeysBang())(
        deepDup(wia(nestedIntegers())),
      ),
    );
  });

  it("stringify keys for hash with indifferent access", () => {
    expect(wia(symbols()).stringifyKeys()).toBeInstanceOf(HashWithIndifferentAccess);
    expect(plainly(wia(symbols()).stringifyKeys())).toEqual(strings());
    expect(plainly(wia(strings()).stringifyKeys())).toEqual(strings());
    expect(plainly(wia(mixed()).stringifyKeys())).toEqual(strings());
  });

  it("deep stringify keys for hash with indifferent access", () => {
    expect(wia(nestedSymbols()).deepStringifyKeys()).toBeInstanceOf(HashWithIndifferentAccess);
    expect(plainly(wia(nestedSymbols()).deepStringifyKeys())).toEqual(nestedStrings());
    expect(plainly(wia(nestedStrings()).deepStringifyKeys())).toEqual(nestedStrings());
    expect(plainly(wia(nestedMixed()).deepStringifyKeys())).toEqual(nestedStrings());
  });

  it("stringify keys bang for hash with indifferent access", () => {
    expect(wia(symbols()).dup().stringifyKeysBang()).toBeInstanceOf(HashWithIndifferentAccess);
    expect(plainly(wia(symbols()).dup().stringifyKeysBang())).toEqual(strings());
    expect(plainly(wia(strings()).dup().stringifyKeysBang())).toEqual(strings());
    expect(plainly(wia(mixed()).dup().stringifyKeysBang())).toEqual(strings());
  });

  it("deep stringify keys bang for hash with indifferent access", () => {
    expect(wia(nestedSymbols()).dup().deepStringifyKeysBang()).toBeInstanceOf(
      HashWithIndifferentAccess,
    );
    expect(plainly(deepDup(wia(nestedSymbols())).deepStringifyKeysBang())).toEqual(nestedStrings());
    expect(plainly(deepDup(wia(nestedStrings())).deepStringifyKeysBang())).toEqual(nestedStrings());
    expect(plainly(deepDup(wia(nestedMixed())).deepStringifyKeysBang())).toEqual(nestedStrings());
  });

  it("nested under indifferent access", () => {
    let foo = wia({
      foo: (() => {
        const h = new SubclassingHash();
        h.set("bar", "baz");
        return h;
      })(),
    });
    expect(foo.get("foo")).toBeInstanceOf(HashWithIndifferentAccess);

    foo = wia({
      foo: (() => {
        const h = new NonIndifferentHash();
        h.set("bar", "baz");
        return h;
      })(),
    });
    expect(foo.get("foo")).toBeInstanceOf(NonIndifferentHash);

    foo = wia({
      foo: (() => {
        const h = new IndifferentHash();
        h.set("bar", "baz");
        return h;
      })(),
    });
    expect(foo.get("foo")).toBeInstanceOf(IndifferentHash);
  });

  it("indifferent assorted", () => {
    const indifferentStrings = wia(strings());
    const indifferentSymbols = wia(symbols());
    const indifferentMixed = wia(mixed());

    expect(
      (indifferentStrings as unknown as { convertKey(k: string): string }).convertKey(":a"),
    ).toEqual("a");

    expect(indifferentStrings.fetch("a")).toEqual(1);
    expect(indifferentStrings.fetch(symbolToS(":a"))).toEqual(1);
    expect(indifferentStrings.fetch(":a")).toEqual(1);

    const hashes = {
      ":@strings": indifferentStrings,
      ":@symbols": indifferentSymbols,
      ":@mixed": indifferentMixed,
    };
    const methodMap: Record<string, [string, unknown]> = {
      "[]": ["get", 1],
      fetch: ["fetch", 1],
      valuesAt: ["valuesAt", [1]],
      hasKey: ["hasKey", true],
      include: ["include", true],
      key: ["key", true],
      member: ["member", true],
    };

    for (const [name, hash] of Object.entries(hashes)) {
      for (const [meth, [method, expected]] of Object.entries(methodMap).sort()) {
        const send = (key: string) =>
          (hash as unknown as Record<string, (k: string) => unknown>)[method](key);
        expect(send("a"), `Calling ${name}.${meth} 'a'`).toEqual(expected);
        expect(send(":a"), `Calling ${name}.${meth} :a`).toEqual(expected);
      }
    }

    expect(indifferentStrings.valuesAt("a", "b")).toEqual([1, 2]);
    expect(indifferentStrings.valuesAt(":a", ":b")).toEqual([1, 2]);
    expect(indifferentSymbols.valuesAt("a", "b")).toEqual([1, 2]);
    expect(indifferentSymbols.valuesAt(":a", ":b")).toEqual([1, 2]);
    expect(indifferentMixed.valuesAt("a", "b")).toEqual([1, 2]);
    expect(indifferentMixed.valuesAt(":a", ":b")).toEqual([1, 2]);
  });

  it("indifferent fetch values", () => {
    const mixed = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });

    expect(mixed.fetchValues("a", "b")).toEqual([1, 2]);
    expect(mixed.fetchValues(":a", ":b")).toEqual([1, 2]);
    expect(mixed.fetchValues(":a", "b")).toEqual([1, 2]);
    expect(mixed.fetchValues(":a", ":c", (key: string) => key)).toEqual([1, "c"]);
    expect(() => mixed.fetchValues(":a", ":c")).toThrow(KeyError);
  });

  it("indifferent reading", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set("a", 1);
    hash.set("b", true);
    hash.set("c", false);
    hash.set("d", null);

    expect(hash.get(":a")).toEqual(1);
    expect(hash.get(":b")).toEqual(true);
    expect(hash.get(":c")).toEqual(false);
    expect(hash.get(":d")).toBeNull();
    expect(hash.get(":e")).toBeUndefined();
  });

  it("indifferent reading with nonnil default", () => {
    const hash = new HashWithIndifferentAccess<unknown>(1);
    hash.set("a", 1);
    hash.set("b", true);
    hash.set("c", false);
    hash.set("d", null);

    expect(hash.get(":a")).toEqual(1);
    expect(hash.get(":b")).toEqual(true);
    expect(hash.get(":c")).toEqual(false);
    expect(hash.get(":d")).toBeNull();
    expect(hash.get(":e")).toEqual(1);
  });

  it("indifferent writing", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set(":a", 1);
    hash.set("b", 2);
    hash.set(3 as unknown as string, 3);

    expect(hash.get("a")).toEqual(1);
    expect(hash.get("b")).toEqual(2);
    expect(hash.get(":a")).toEqual(1);
    expect(hash.get(":b")).toEqual(2);
    expect(hash.get(3 as unknown as string)).toEqual(3);
  });

  it("indifferent update", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set(":a", "a");
    hash.set("b", "b");

    const updatedWithStrings = hash.update(strings());
    const updatedWithSymbols = hash.update(symbols());
    const updatedWithMixed = hash.update(mixed());

    expect(updatedWithStrings.get(":a")).toEqual(1);
    expect(updatedWithStrings.get("a")).toEqual(1);
    expect(updatedWithStrings.get("b")).toEqual(2);

    expect(updatedWithSymbols.get(":a")).toEqual(1);
    expect(updatedWithSymbols.get("b")).toEqual(2);
    expect(updatedWithSymbols.get(":b")).toEqual(2);

    expect(updatedWithMixed.get(":a")).toEqual(1);
    expect(updatedWithMixed.get("b")).toEqual(2);

    expect(
      [updatedWithStrings, updatedWithSymbols, updatedWithMixed].every((h) => h.size === 2),
    ).toBeTruthy();
  });

  it("update with to hash conversion", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.update(new HashByConversion({ ":a": 1 }) as never);
    expect(hash.get("a")).toEqual(1);
  });

  it("indifferent merging", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set(":a", "failure");
    hash.set("b", "failure");

    const other = { a: 1, ":b": 2 };

    const merged = hash.merge(other);

    expect(merged.constructor).toEqual(HashWithIndifferentAccess);
    expect(merged.get(":a")).toEqual(1);
    expect(merged.get("b")).toEqual(2);

    hash.update(other);

    expect(hash.get(":a")).toEqual(1);
    expect(hash.get("b")).toEqual(2);
  });

  it("merging with multiple arguments", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    const merged = hash.merge({ a: 1 }, { b: 2 });

    expect(merged.get("a")).toEqual(1);
    expect(merged.get("b")).toEqual(2);
  });

  it("merge with to hash conversion", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    const merged = hash.merge(new HashByConversion({ ":a": 1 }) as never);
    expect(merged.get("a")).toEqual(1);
  });

  it("indifferent replace", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set(":a", 42);

    const replaced = hash.replace({ ":b": 12 });

    expect(hash.key("b")).toBeTruthy();
    expect(hash.key(":a")).toBeFalsy();
    expect(hash.get(":b")).toEqual(12);
    expect(replaced).toBe(hash);
  });

  it("replace with to hash conversion", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.set(":a", 42);

    const replaced = hash.replace(new HashByConversion({ ":b": 12 }) as never);

    expect(hash.key("b")).toBeTruthy();
    expect(hash.key(":a")).toBeFalsy();
    expect(hash.get(":b")).toEqual(12);
    expect(replaced).toBe(hash);
  });

  it("indifferent merging with block", () => {
    const hash = new HashWithIndifferentAccess<number>();
    hash.set(":a", 1);
    hash.set("b", 3);

    const other = { a: 4, ":b": 2, c: 10 };

    let merged = hash.merge(other, (_key, old, n) => (old > n ? old : n));

    expect(merged.constructor).toEqual(HashWithIndifferentAccess);
    expect(merged.get(":a")).toEqual(4);
    expect(merged.get("b")).toEqual(3);
    expect(merged.get(":c")).toEqual(10);

    const otherIndifferent = new HashWithIndifferentAccess<number>({ a: 9, ":b": 2 });

    merged = hash.merge(otherIndifferent, (_key, old, n) => old + n);

    expect(merged.constructor).toEqual(HashWithIndifferentAccess);
    expect(merged.get(":a")).toEqual(10);
    expect(merged.get(":b")).toEqual(5);
  });

  it("indifferent reverse merging", () => {
    let hash = new HashWithIndifferentAccess<unknown>({ key: ":old_value" });
    hash.reverseMergeBang({ key: ":new_value" });
    expect(hash.get(":key")).toBe(":old_value");

    hash = new HashWithIndifferentAccess<unknown>({ some: "value", other: "value" });
    hash.reverseMergeBang({ some: "noclobber", another: "clobber" });
    expect(hash.get(":some")).toBe("value");
    expect(hash.get(":another")).toBe("clobber");
  });

  it("indifferent with defaults aliases reverse merge", () => {
    let hash = new HashWithIndifferentAccess<unknown>({ key: ":old_value" });
    const actual = hash.withDefaults({ key: ":new_value" });
    expect(actual.get(":key")).toBe(":old_value");

    hash = new HashWithIndifferentAccess<unknown>({ key: ":old_value" });
    hash.withDefaultsBang({ key: ":new_value" });
    expect(hash.get(":key")).toBe(":old_value");
  });

  it("indifferent deleting", () => {
    const getHash = () => new HashWithIndifferentAccess({ a: "foo" });
    let hash = getHash();
    expect(hash.delete("a")).toBe("foo");
    expect(hash.delete("a")).toBeUndefined();
    hash = getHash();
    expect(hash.delete("a")).toBe("foo");
    expect(hash.delete("a")).toBeUndefined();
  });

  it("indifferent select", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select((_k, v) => v === 1);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(selected.toHash())).toEqual({ a: 1 });
  });

  it("indifferent select returns enumerator", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected.size).toBe(2);
  });

  it("indifferent select returns a hash when unchanged", () => {
    const hash = new HashWithIndifferentAccess(strings()).select(() => true);

    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent select bang", () => {
    const indifferentStrings = new HashWithIndifferentAccess(strings());
    indifferentStrings.selectBang((_k, v) => v === 1);

    expect(plainly(indifferentStrings)).toEqual({ a: 1 });
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent reject", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject((_k, v) => v !== 1);
    expect(rejected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(rejected.toHash())).toEqual({ a: 1 });
  });

  it("indifferent reject returns enumerator", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject(() => false);
    expect(rejected.size).toBe(2);
  });

  it("indifferent reject bang", () => {
    const indifferentStrings = new HashWithIndifferentAccess(strings());
    indifferentStrings.rejectBang((_k, v) => v !== 1);

    expect(plainly(indifferentStrings)).toEqual({ a: 1 });
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent transform keys", async () => {
    let hash = new HashWithIndifferentAccess(strings()).transformKeys((k) => k.repeat(2));

    expect(plainly(hash)).toEqual({ aa: 1, bb: 2 });
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(strings()).transformKeys((k) => `:${k}`);

    expect(hash.get(":a")).toEqual(1);
    expect(hash.get("a")).toEqual(1);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(strings()).transformKeys({ a: "x", y: "z" });

    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("x")).toEqual(1);
    expect(hash.get("b")).toEqual(2);
    expect(hash.get("y")).toBeUndefined();
    expect(hash.get("z")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["x", "b"]);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(strings()).transformKeys({ a: "A", q: "Q" }, (k) =>
      k.repeat(3),
    );

    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("A")).toEqual(1);
    expect(hash.get("bbb")).toEqual(2);
    expect(hash.get("q")).toBeUndefined();
    expect(hash.get("Q")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["A", "bbb"]);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    await assertRaises([TypeError], {}, () => hash.transformKeys(null));
  });

  it("indifferent deep transform keys", () => {
    let hash = new HashWithIndifferentAccess(nestedStrings()).deepTransformKeys((k) => k.repeat(2));

    expect(plainly(hash)).toEqual({ aa: { bb: { cc: 3 } } });
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(nestedStrings()).deepTransformKeys((k) => `:${k}`);

    expect(hash.dig(":a", ":b", ":c")).toEqual(3);
    expect(hash.dig("a", "b", "c")).toEqual(3);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent transform keys bang", async () => {
    let indifferentStrings = new HashWithIndifferentAccess(strings());
    indifferentStrings.transformKeysBang((k) => k.repeat(2));

    expect(plainly(indifferentStrings)).toEqual({ aa: 1, bb: 2 });
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);

    indifferentStrings = new HashWithIndifferentAccess(strings());
    indifferentStrings.transformKeysBang((k) => `:${k}`);

    expect(indifferentStrings.get(":a")).toEqual(1);
    expect(indifferentStrings.get("a")).toEqual(1);
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);

    let hash = new HashWithIndifferentAccess(strings());
    hash.transformKeysBang({ a: "x", y: "z" });

    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("x")).toEqual(1);
    expect(hash.get("b")).toEqual(2);
    expect(hash.get("y")).toBeUndefined();
    expect(hash.get("z")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["x", "b"]);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(strings());
    hash.transformKeysBang({ a: "A", q: "Q" }, (k) => k.repeat(3));

    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("A")).toEqual(1);
    expect(hash.get("bbb")).toEqual(2);
    expect(hash.get("q")).toBeUndefined();
    expect(hash.get("Q")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["A", "bbb"]);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    await assertRaises([TypeError], {}, () => hash.transformKeys(null));
  });

  it("indifferent deep transform keys bang", () => {
    let hash = new HashWithIndifferentAccess(nestedStrings());
    hash.deepTransformKeysBang((k) => k.repeat(2));

    expect(plainly(hash)).toEqual({ aa: { bb: { cc: 3 } } });
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);

    hash = new HashWithIndifferentAccess(nestedStrings());
    hash.deepTransformKeysBang((k) => `:${k}`);

    expect(hash.dig(":a", ":b", ":c")).toEqual(3);
    expect(hash.dig("a", "b", "c")).toEqual(3);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent transform values", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformValues((v) => (v as number) * 2);
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(transformed.toHash())).toEqual({ a: 2, b: 4 });
  });

  it("indifferent transform values bang", () => {
    const indifferentStrings = new HashWithIndifferentAccess<number>(strings());
    indifferentStrings.transformValuesBang((v) => v * 2);

    expect(plainly(indifferentStrings)).toEqual({ a: 2, b: 4 });
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("indifferent assoc", () => {
    const indifferentStrings = new HashWithIndifferentAccess(strings());
    const [key, value] = indifferentStrings.assoc(":a")!;

    expect(key).toEqual("a");
    expect(value).toEqual(1);
  });

  it("indifferent compact", () => {
    const hashContainNilValue = { ...strings(), z: null };
    const hash = new HashWithIndifferentAccess<unknown>(hashContainNilValue);
    let compactedHash = hash.compact();

    expect(plainly(compactedHash)).toEqual(strings());
    expect(plainly(hash)).toEqual(hashContainNilValue);
    expect(compactedHash).toBeInstanceOf(HashWithIndifferentAccess);

    const emptyHash = new HashWithIndifferentAccess<unknown>();
    compactedHash = emptyHash.compact();

    expect(compactedHash).toEqual(emptyHash);

    const nonEmptyHash = new HashWithIndifferentAccess<unknown>({ ":foo": ":bar" });
    compactedHash = nonEmptyHash.compact();

    expect(compactedHash).toEqual(nonEmptyHash);
  });

  it("indifferent to hash", () => {
    expect(plainly(wia(mixed()).toHash())).toEqual(strings());

    const mixedWithDefault = hashOf(Object.entries(mixed()));
    mixedWithDefault.setDefault("1234");
    const roundtrip = wia(mixedWithDefault).toHash();
    expect(plainly(roundtrip)).toEqual(strings());
    expect(roundtrip.default()).toEqual("1234");

    const newToHash = wia(nestedMixed()).toHash();
    expect(newToHash.constructor === HashWithIndifferentAccess).toBeFalsy();
    expect((newToHash.get("a") as object).constructor === HashWithIndifferentAccess).toBeFalsy();
    expect(
      ((newToHash.get("a") as Hash<string, unknown>).get("b") as object).constructor ===
        HashWithIndifferentAccess,
    ).toBeFalsy();
  });

  it("with indifferent access has no side effects on existing hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    dup.set("b", 2);
    expect(h.hasKey("b")).toBe(false);
  });

  it("indifferent hash with array of hashes", () => {
    let hash: Hash<string, unknown> = wia({ urls: { url: [{ address: "1" }, { address: "2" }] } });
    expect(
      ((hash.get(":urls") as Hash<string, unknown>).get(":url") as Hash<string, unknown>[])[0].get(
        ":address",
      ),
    ).toEqual("1");

    hash = (hash as HashWithIndifferentAccess<unknown>).toHash();
    expect(hash.constructor === HashWithIndifferentAccess).toBeFalsy();
    expect((hash.get("urls") as object).constructor === HashWithIndifferentAccess).toBeFalsy();
    expect(
      ((hash.get("urls") as Hash<string, unknown>).get("url") as object[])[0].constructor ===
        HashWithIndifferentAccess,
    ).toBeFalsy();
  });

  it("should preserve array subclass when value is array", () => {
    const arr = [1, 2, 3];
    const h = new HashWithIndifferentAccess<unknown>({ list: arr });
    expect(h.get("list")).toEqual(arr);
  });

  it("should preserve array class when hash value is frozen array", () => {
    const arr = Object.freeze([1, 2, 3]);
    const h = new HashWithIndifferentAccess<unknown>({ list: arr });
    expect(h.get("list")).toEqual(arr);
  });

  it("stringify and symbolize keys on indifferent preserves hash", () => {
    let h: Hash<string, unknown> = new HashWithIndifferentAccess<unknown>();
    h.set(":first", 1);
    h = (h as HashWithIndifferentAccess<unknown>).stringifyKeys();
    expect(h.get("first")).toEqual(1);
    h = new HashWithIndifferentAccess<unknown>();
    h.set("first", 1);
    h = (h as HashWithIndifferentAccess<unknown>).symbolizeKeys();
    expect(h.get(":first")).toEqual(1);
  });

  it("deep stringify and deep symbolize keys on indifferent preserves hash", () => {
    let h: Hash<string, unknown> = new HashWithIndifferentAccess<unknown>();
    h.set(":first", 1);
    h = (h as HashWithIndifferentAccess<unknown>).deepStringifyKeys();
    expect(h.get("first")).toEqual(1);
    h = new HashWithIndifferentAccess<unknown>();
    h.set("first", 1);
    h = (h as HashWithIndifferentAccess<unknown>).deepSymbolizeKeys();
    expect(h.get(":first")).toEqual(1);
  });

  it("to options on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(Object.fromEntries(h.toHash())).toEqual({ a: 1 });
  });

  it("to options on indifferent preserves works as hash with dup", () => {
    const h = new HashWithIndifferentAccess<unknown>({ ":a": { ":b": "b" } });
    const dup = h.dup();

    (dup.get(":a") as HashWithIndifferentAccess<unknown>).set(":c", "c");
    expect((h.get(":a") as HashWithIndifferentAccess<unknown>).get(":c")).toEqual("c");
  });

  it("indifferent sub hashes", () => {
    let h = wia({ user: { id: 5 } });
    for (const user of ["user", ":user"]) {
      for (const id of [":id", "id"]) {
        expect(
          (h.get(user) as HashWithIndifferentAccess<unknown>).get(id),
          `h[${user}][${id}] should be 5`,
        ).toEqual(5);
      }
    }

    h = wia({ ":user": { ":id": 5 } });
    for (const user of ["user", ":user"]) {
      for (const id of [":id", "id"]) {
        expect(
          (h.get(user) as HashWithIndifferentAccess<unknown>).get(id),
          `h[${user}][${id}] should be 5`,
        ).toEqual(5);
      }
    }
  });

  it("indifferent duplication", () => {
    let h = new HashWithIndifferentAccess<unknown>();
    h.setDefault("1234");
    expect(h.dup().default()).toEqual(h.default());

    h = new IndifferentHash();
    expect(h.dup().constructor).toEqual(h.constructor);
  });

  it("argless default with existing nil key", () => {
    const h = new HashWithIndifferentAccess<unknown>(":default").merge({ null: "defined" });

    expect(h.default()).toBe(":default");
  });

  it("default with argument", () => {
    const h = new HashWithIndifferentAccess<unknown>(() => 5).merge({ "1": 2 });

    expect(h.default("1")).toBe(5);
  });

  it("default proc", () => {
    const h = new HashWithIndifferentAccess<unknown>((_hash: unknown, key: string) => key);

    expect(h.default()).toBeUndefined();
    expect(h.default("foo")).toBe("foo");
    expect(h.default(":foo")).toBe("foo");
  });

  it("double conversion with nil key", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: null });
    expect(h.get("a")).toBeNull();
  });

  it("assorted keys not stringified", () => {
    const original = hashOf([
      [{}, 2],
      [1, 2],
      [[], true],
    ]);
    const indiff = wia(original);
    expect(
      [...indiff.keys()].some((k) => typeof k === "string"),
      "A key was converted to a string!",
    ).toBeFalsy();
  });

  it("deep merge on indifferent access", () => {
    const hash1 = new HashWithIndifferentAccess<unknown>({
      ":a": "a",
      ":b": "b",
      ":c": { ":c1": "c1", ":c2": "c2", ":c3": { ":d1": "d1" } },
    });
    const hash2 = new HashWithIndifferentAccess<unknown>({
      ":a": 1,
      ":c": { ":c1": 2, ":c3": { ":d2": "d2" } },
    });
    const hash3 = { ":a": 1, ":c": { ":c1": 2, ":c3": { ":d2": "d2" } } };
    const expected = { a: 1, b: "b", c: { c1: 2, c2: "c2", c3: { d1: "d1", d2: "d2" } } };
    expect(plainly(hash1.deepMerge(hash2))).toEqual(expected);
    expect(plainly(hash1.deepMerge(hash3))).toEqual(expected);

    hash1.deepMergeBang(hash2);
    expect(plainly(hash1)).toEqual(expected);
  });

  it("store on indifferent access", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  it("constructor on indifferent access", () => {
    const hash = HashWithIndifferentAccess.get(":foo", 1);
    expect(hash.get(":foo")).toEqual(1);
    expect(hash.get("foo")).toEqual(1);
    hash.set(":foo", 3);
    expect(hash.get(":foo")).toEqual(3);
    expect(hash.get("foo")).toEqual(3);
  });

  it("indifferent slice", () => {
    const original = new HashWithIndifferentAccess<unknown>({ a: "x", b: "y", c: 10 });
    const expected = new HashWithIndifferentAccess<unknown>({ a: "x", b: "y" });

    for (const keys of [
      ["a", "b"],
      [":a", ":b"],
    ]) {
      expect(original.slice(...keys).toHash()).toEqual(expected.toHash());
      expect(original.toHash()).not.toEqual(expected.toHash());
    }
  });

  it("indifferent slice access with symbols", () => {
    const original = new HashWithIndifferentAccess({
      login: "bender",
      password: "shiny",
      stuff: "foo",
    });

    const slice = original.slice(":login", ":password");

    expect(slice.get(":login")).toBe("bender");
    expect(slice.get("login")).toBe("bender");
  });

  it("indifferent without", () => {
    const original = wia({ ":a": "x", ":b": "y", ":c": 10 });
    const expected = wia({ ":c": 10 });

    for (const keys of [
      ["a", "b"],
      [":a", ":b"],
    ]) {
      expect(original.without(...keys), inspect(keys)).toEqual(expected);
      expect(original).not.toEqual(expected);
    }
  });

  it("indifferent extract", () => {
    const original = wia({ ":a": 1, b: 2, ":c": 3, d: 4 });
    const expected = wia({ ":a": 1, ":b": 2 });
    const remaining = wia({ ":c": 3, ":d": 4 });

    for (const keys of [
      ["a", "b"],
      [":a", ":b"],
    ]) {
      const copy = original.dup();
      expect(copy.extractBang(...keys)).toEqual(expected);
      expect(copy).toEqual(remaining);
    }
  });

  it("new with to hash conversion", () => {
    const hash = new HashWithIndifferentAccess<unknown>(new HashByConversion({ ":a": 1 }) as never);
    expect(hash.key("a")).toBeTruthy();
    expect(hash.get(":a")).toEqual(1);
  });

  it("dup with default proc", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.setDefaultProc(() => {
      throw new Error("walrus");
    });
    expect(() => hash.dup()).not.toThrow();
  });

  it("dup with default proc sets proc", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.setDefaultProc((_h: unknown, k: string) => Number(k) + 1);
    const newHash = hash.dup();

    expect(newHash.get("2")).toBe(3);

    newHash.setDefault(2);
    expect(newHash.get(":non_existent")).toBe(2);
  });

  it("to hash with raising default proc", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.setDefaultProc(() => {
      throw new Error("walrus");
    });

    expect(() => hash.toHash()).not.toThrow();
  });

  it("new with to hash conversion copies default", () => {
    const normalHash = new Hash<unknown, unknown>(3);
    normalHash.set(":a", 1);

    const hash = new HashWithIndifferentAccess<unknown>(new HashByConversion(normalHash) as never);
    expect(hash.get(":a")).toEqual(1);
    expect(hash.get(":b")).toEqual(3);
  });

  it("new with to hash conversion copies default proc", () => {
    const normalHash = new Hash<unknown, unknown>(() => 1 + 2);
    normalHash.set(":a", 1);

    const hash = new HashWithIndifferentAccess<unknown>(new HashByConversion(normalHash) as never);
    expect(hash.get(":a")).toEqual(1);
    expect(hash.get(":b")).toEqual(3);
  });

  it("inheriting from top level hash with indifferent access preserves ancestors chain", () => {
    const klass = class extends HashWithIndifferentAccess {};
    expect(Object.getPrototypeOf(klass)).toEqual(HashWithIndifferentAccess);
  });

  it("inheriting from hash with indifferent access properly dumps ivars", () => {
    class MyHWIA<V> extends HashWithIndifferentAccess<V> {}
    const h = new MyHWIA({ x: 42 });
    expect(Object.fromEntries(h.toHash())).toEqual({ x: 42 });
  });

  it("should use default proc for unknown key", () => {
    const hashWia = new HashWithIndifferentAccess<unknown>(() => 1 + 2);
    expect(hashWia.get(":new_key")).toEqual(3);
  });

  it("should return nil if no key is supplied", () => {
    const hashWia = new HashWithIndifferentAccess<unknown>(() => 1 + 2);
    expect(hashWia.default()).toBeUndefined();
  });

  it("should use default value for unknown key", () => {
    const hashWia = new HashWithIndifferentAccess<unknown>(3);
    expect(hashWia.get(":new_key")).toEqual(3);
  });

  it("should use default value if no key is supplied", () => {
    const hashWia = new HashWithIndifferentAccess<unknown>(3);
    expect(hashWia.default()).toEqual(3);
  });

  it("should nil if no default value is supplied", () => {
    const hashWia = new HashWithIndifferentAccess<unknown>();
    expect(hashWia.default()).toBeUndefined();
  });

  it("should return dup for with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("allows setting frozen array values with indifferent access", () => {
    const arr = Object.freeze([1, 2, 3]);
    const h = new HashWithIndifferentAccess<unknown>();
    h.set("arr", arr);
    expect(h.get("arr")).toEqual(arr);
  });

  it("should copy the default value when converting to hash with indifferent access", () => {
    const hash = new Hash<string, unknown>(3);
    const hashWia = wia(hash);
    expect(hashWia.default()).toEqual(3);
  });

  it("should copy the default proc when converting to hash with indifferent access", () => {
    const hash = new Hash<string, unknown>(() => 2 + 1);
    expect(hash.get(":foo")).toEqual(3);

    const hashWia = wia(hash);
    expect(hashWia.get(":foo")).toEqual(3);
    expect(hashWia.get(":bar")).toEqual(3);
  });

  it("should copy the default when converting non hash to hash with indifferent access", () => {
    const nonHash = new (class {
      toHash() {
        const h = new Hash<string, unknown>();
        h.set(":foo", ":bar");
        h.setDefault(":baz");
        return h;
      }
    })();

    const hashWia = new HashWithIndifferentAccess<unknown>(nonHash as never);
    expect(hashWia.get(":foo")).toEqual(":bar");
    expect(hashWia.get(":missing")).toEqual(":baz");
  });

  it("should copy the default proc when converting non hash to hash with indifferent access", () => {
    const nonHash = new (class {
      toHash() {
        const h = new Hash<string, unknown>();
        h.set(":foo", ":bar");
        h.setDefaultProc((hash, key) => {
          hash.set(key, ":baz");
          return ":baz";
        });
        return h;
      }
    })();

    const hashWia = new HashWithIndifferentAccess<unknown>(nonHash as never);
    expect(hashWia.get(":foo")).toEqual(":bar");
    expect(hashWia.get(":missing")).toEqual(":baz");
  });

  it("indifferent to proc", () => {
    const strings = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const proc = strings.toProc();

    expect(proc("a")).toBe(1);
    expect(proc(":a")).toBe(1);
    expect(proc(":no_such")).toBeUndefined();
  });

  it("indifferent transform_keys bang", () => {
    const strings = { a: 1, b: 2 };

    let indifferentStrings = new HashWithIndifferentAccess<number>(strings);
    indifferentStrings.transformKeysBang((k) => k.repeat(2));
    expect(Object.fromEntries(indifferentStrings.toHash())).toEqual({ aa: 1, bb: 2 });
    expect(indifferentStrings).toBeInstanceOf(HashWithIndifferentAccess);

    indifferentStrings = new HashWithIndifferentAccess<number>(strings);
    indifferentStrings.transformKeysBang((k) => `:${k}`);
    expect(indifferentStrings.get(":a")).toBe(1);
    expect(indifferentStrings.get("a")).toBe(1);

    let hash = new HashWithIndifferentAccess<number>(strings);
    hash.transformKeysBang({ a: "x", y: "z" });
    expect(hash.get("a")).toBeUndefined();
    expect(hash.get("x")).toBe(1);
    expect(hash.get("b")).toBe(2);
    expect(hash.get("z")).toBeUndefined();
    expect([...hash.keys()]).toEqual(["x", "b"]);

    hash = new HashWithIndifferentAccess<number>(strings);
    hash.transformKeysBang({ a: "A", q: "Q" }, (k) => k.repeat(3));
    expect(hash.get("A")).toBe(1);
    expect(hash.get("bbb")).toBe(2);
    expect([...hash.keys()]).toEqual(["A", "bbb"]);

    expect(() => hash.transformKeysBang(null)).toThrow(/no implicit conversion of nil/);
  });

  it("indifferent slice inplace", () => {
    const original = wia({ ":a": "x", ":b": "y", ":c": 10 });
    const expected = wia({ ":c": 10 });

    for (const keys of [
      ["a", "b"],
      [":a", ":b"],
    ]) {
      const copy = original.dup();
      expect(copy.sliceBang(...keys)).toEqual(expected);
    }
  });

  it("to options on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("first", 1);
    h.toOptionsBang();
    expect(h.get("first")).toBe(1);
  });
});
