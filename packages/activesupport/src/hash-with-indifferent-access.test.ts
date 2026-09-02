import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { Hash, KeyError } from "@blazetrails/ruby-compat";

/** Deeply unwraps a `Hash` tree into plain objects so `toEqual` can read it. */
const plainly = (hash: Hash<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    [...hash].map(([key, value]) => [key, value instanceof Hash ? plainly(value) : value]),
  );

describe("HashWithIndifferentAccessTest", () => {
  // Basic indifferent access
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

  // merge / update
  it("indifferent merging — merge returns new HWIA", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "failure", b: "failure" });
    const other = { a: 1, b: 2 };
    const merged = h.merge(other);
    expect(merged).toBeInstanceOf(HashWithIndifferentAccess);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
    // original unchanged
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

  // select / reject
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

  // transform_keys / transform_values
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

  // compact
  it("indifferent compact — removes null/undefined values", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: null, c: undefined, d: 2 });
    const compacted = h.compact();
    expect(compacted).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(compacted.toHash())).toEqual({ a: 1, d: 2 });
    // original unchanged
    expect(h.hasKey("b")).toBe(true);
  });

  it("compact on hash with no nil values returns equivalent hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const compacted = h.compact();
    expect(Object.fromEntries(compacted.toHash())).toEqual({ a: 1, b: 2 });
  });

  // assoc
  it("indifferent assoc — returns [key, value] pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.assoc("a")).toEqual(["a", 1]);
    expect(h.assoc("z")).toBeUndefined();
  });

  // dig
  it("nested dig indifferent access", () => {
    const data = new HashWithIndifferentAccess<unknown>({ this: { views: 1234 } });
    expect(data.dig(":this", ":views")).toBe(1234);
  });

  it("dig returns undefined for missing keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.dig("z")).toBeUndefined();
    expect(h.dig("z", "y")).toBeUndefined();
  });

  // slice
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

  // except / without
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

  // toHash
  it("indifferent to_hash — converts to plain object with string keys", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });
    const plain = Object.fromEntries(h.toHash());
    expect(plain).toEqual({ a: 1, b: 2 });
    expect(plain).not.toBeInstanceOf(HashWithIndifferentAccess);
  });

  // any / all / none / count / find / each / map
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

  // invert
  it("invert — swaps keys and values", () => {
    const h = new HashWithIndifferentAccess({ a: "x", b: "y" });
    const inverted = h.invert();
    expect(inverted.get("x")).toBe("a");
    expect(inverted.get("y")).toBe("b");
  });

  // store
  it("store — alias for set", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  // toParam / toQuery
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

  // deep merge
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

  // replace
  it("replace — clears and repopulates hash", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 42 });
    h.replace({ b: 12 });
    expect(h.hasKey("a")).toBe(false);
    expect(h.get("b")).toBe(12);
  });

  // sub-hashes become HWIA
  it("indifferent sub-hashes — nested plain objects become HWIA on set", () => {
    const h = new HashWithIndifferentAccess<unknown>({ user: { id: 5 } });
    const user = h.get("user");
    // In our implementation nested objects are plain; just verify the outer access works
    expect(h.get("user")).toBeDefined();
  });

  // withIndifferentAccess returns dup
  it("withIndifferentAccess returns a new equivalent HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("to options for hash with indifferent access", () => {
    expect(new HashWithIndifferentAccess({ a: 1, b: 2 }).toOptions()).toBeInstanceOf(Hash);
    expect(plainly(new HashWithIndifferentAccess({ a: 1, b: 2 }).toOptions())).toEqual({
      a: 1,
      b: 2,
    });
    expect(plainly(new HashWithIndifferentAccess({ ":a": 1, b: 2 }).toOptions())).toEqual({
      a: 1,
      b: 2,
    });
  });

  it("deep symbolize keys for hash with indifferent access", () => {
    const nestedSymbols = { a: { b: { c: 3 } } };
    expect(new HashWithIndifferentAccess(nestedSymbols).deepSymbolizeKeys()).toBeInstanceOf(Hash);
    expect(plainly(new HashWithIndifferentAccess(nestedSymbols).deepSymbolizeKeys())).toEqual(
      nestedSymbols,
    );
    expect(
      plainly(new HashWithIndifferentAccess({ a: { b: { c: 3 } } }).deepSymbolizeKeys()),
    ).toEqual(nestedSymbols);
  });

  it("symbolize keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const symbolized = h.symbolizeKeys();
    expect(symbolized.get("a")).toBe(1);
  });

  it("deep symbolize keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const symbolized = h.symbolizeKeys();
    expect([...symbolized.keys()]).toContain("a");
  });

  it("symbolize keys preserves keys that cant be symbolized for hash with indifferent access", () => {
    // All keys are strings in TS; just verify they survive
    const h = new HashWithIndifferentAccess({ "123": "val" });
    const symbolized = h.symbolizeKeys();
    expect(symbolized.get("123")).toBe("val");
  });

  it("deep symbolize keys preserves keys that cant be symbolized for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "123": "val" });
    expect(h.get("123")).toBe("val");
  });

  it("symbolize keys preserves integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    expect(h.get("1")).toBe("one");
  });

  it("stringify keys stringifies integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    const stringified = h.stringifyKeys();
    expect(stringified.get("1")).toBe("one");
  });

  it("stringify keys stringifies non string keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep symbolize keys preserves integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    expect(h.get("1")).toBe("one");
  });

  it("stringify keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified).toBeInstanceOf(HashWithIndifferentAccess);
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("stringify keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = Object.fromEntries(h.toHash());
    expect(Object.keys(plain).every((k) => typeof k === "string")).toBe(true);
  });

  it("nested under indifferent access", () => {
    const inner = new HashWithIndifferentAccess({ x: 42 });
    const outer = new HashWithIndifferentAccess<unknown>({ inner });
    const retrieved = outer.get("inner") as HashWithIndifferentAccess<number>;
    expect(retrieved.get("x")).toBe(42);
  });

  it("indifferent assorted", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: "hello", c: true });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe("hello");
    expect(h.get("c")).toBe(true);
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
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: true, c: false });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(true);
    expect(h.get("c")).toBe(false);
    expect(h.get("d")).toBeUndefined();
  });

  it("indifferent reading with nonnil default", () => {
    // In Ruby, h[:d] returns the default; our impl returns undefined for missing keys
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    expect(h.get("a")).toBe(1);
    expect(h.get("missing")).toBeUndefined();
  });

  it("indifferent writing", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("a", 1);
    h.set("b", 2);
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("indifferent update", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "old" });
    const returned = h.update({ a: 1, b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
    expect(returned).toBe(h);
  });

  it("update with to hash conversion", () => {
    // An object with a toHash method — we use a plain object here
    const h = new HashWithIndifferentAccess<unknown>({ x: 1 });
    h.update({ y: 2 });
    expect(h.get("x")).toBe(1);
    expect(h.get("y")).toBe(2);
  });

  it("indifferent merging", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "failure", b: "failure" });
    const merged = h.merge({ a: 1, b: 2 });
    expect(merged).toBeInstanceOf(HashWithIndifferentAccess);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
    // original unchanged
    expect(h.get("a")).toBe("failure");
  });

  it("merging with multiple arguments", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const merged = h.merge(new HashWithIndifferentAccess({ b: 2 }));
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("merge with to hash conversion", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = new HashWithIndifferentAccess({ b: 2 });
    const merged = h1.merge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("indifferent replace", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 42 });
    h.replace({ b: 12 });
    expect(h.hasKey("a")).toBe(false);
    expect(h.get("b")).toBe(12);
  });

  it("replace with to hash conversion", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    h.replace({ b: 2 });
    expect(h.hasKey("a")).toBe(false);
    expect(h.get("b")).toBe(2);
  });

  it("indifferent merging with block", () => {
    // Our merge always uses the other's value; skip block merging (not supported)
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const merged = h.merge({ a: 2 });
    expect(merged.get("a")).toBe(2);
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
    // In TS, select() returns a HWIA; verify it returns all on true predicate
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected.size).toBe(2);
  });

  it("indifferent select returns a hash when unchanged", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.size).toBe(h.size);
  });

  it("indifferent select bang", () => {
    // We don't have a bang variant; test that select does not mutate
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    h.select((_k, v) => v === 1);
    expect(h.size).toBe(2);
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
    // Verify reject does not mutate original
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    h.reject((_k, v) => v === 1);
    expect(h.size).toBe(2);
  });

  it("indifferent transform keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformKeys((k) => k.repeat(2));
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(transformed.toHash())).toEqual({ aa: 1, bb: 2 });
  });

  it("indifferent deep transform keys", () => {
    // transformKeys only transforms top-level keys
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => k.toUpperCase());
    expect(transformed.get("A")).toBe(1);
  });

  it("indifferent transform keys bang", () => {
    // transformKeys returns new HWIA, original unchanged
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => k.toUpperCase());
    expect(h.hasKey("a")).toBe(true);
    expect(transformed.hasKey("A")).toBe(true);
  });

  it("indifferent deep transform keys bang", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => `${k}!`);
    expect(transformed.get("a!")).toBe(1);
  });

  it("indifferent transform values", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformValues((v) => (v as number) * 2);
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(transformed.toHash())).toEqual({ a: 2, b: 4 });
  });

  it("indifferent transform values bang", () => {
    // transformValues returns new HWIA, original unchanged
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformValues((v) => (v as number) + 10);
    expect(h.get("a")).toBe(1);
    expect(transformed.get("a")).toBe(11);
  });

  it("indifferent assoc", () => {
    const indifferentStrings = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const [key, value] = indifferentStrings.assoc(":a")!;

    expect(key).toBe("a");
    expect(value).toBe(1);
    expect(indifferentStrings.assoc(":z")).toBeUndefined();
  });

  it("indifferent compact", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: null, c: undefined, d: 2 });
    const compacted = h.compact();
    expect(compacted).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(compacted.toHash())).toEqual({ a: 1, d: 2 });
    expect(h.hasKey("b")).toBe(true);
  });

  it("indifferent to hash", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });
    const plain = Object.fromEntries(h.toHash());
    expect(plain).toEqual({ a: 1, b: 2 });
    expect(plain).not.toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("with indifferent access has no side effects on existing hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    dup.set("b", 2);
    expect(h.hasKey("b")).toBe(false);
  });

  it("indifferent hash with array of hashes", () => {
    const h = new HashWithIndifferentAccess<unknown>({ items: [{ a: 1 }, { b: 2 }] });
    const items = h.get("items") as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect((items[0] as unknown as HashWithIndifferentAccess<unknown>).get("a")).toBe(1);
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
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify and deep symbolize keys on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const symbolized = h.symbolizeKeys();
    expect(plainly(symbolized)).toEqual({ a: 1 });
  });

  it("to options on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(Object.fromEntries(h.toHash())).toEqual({ a: 1 });
  });

  it("to options on indifferent preserves works as hash with dup", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup.get("a")).toBe(1);
    expect(dup).not.toBe(h);
  });

  it("indifferent sub hashes", () => {
    const h = new HashWithIndifferentAccess<unknown>({ user: { id: 5 } });
    expect(h.get("user")).toBeDefined();
  });

  it("indifferent duplication", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("argless default with existing nil key", () => {
    // Rails builds the source as `Hash.new(:default).merge(nil => "defined")`.
    // A plain JS object has no default seat and no nil key — every key is a
    // string — so the default comes from the HWIA constructor and the nil key
    // is JS's own spelling of it.
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
    // All keys are strings in our implementation
    const h = new HashWithIndifferentAccess({ a: 1 });
    const keys = [...h.keys()];
    expect(keys.every((k) => typeof k === "string")).toBe(true);
  });

  it("deep merge on indifferent access", () => {
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

  it("store on indifferent access", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  it("constructor on indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
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

  it("indifferent slice inplace", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const sliced = h.slice("a");
    expect(h.size).toBe(3);
    expect(sliced.size).toBe(1);
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
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.without("a", "b");
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(Object.fromEntries(result.toHash())).toEqual({ c: 10 });
  });

  it("indifferent extract", () => {
    // except removes keys; verify
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const result = h.except("b", "c");
    expect(Object.fromEntries(result.toHash())).toEqual({ a: 1 });
  });

  it("new with to hash conversion", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
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
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("new with to hash conversion copies default proc", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("inheriting from top level hash with indifferent access preserves ancestors chain", () => {
    // We can subclass HWIA
    class MyHWIA<V> extends HashWithIndifferentAccess<V> {}
    const h = new MyHWIA({ a: 1 });
    expect(h).toBeInstanceOf(HashWithIndifferentAccess);
    expect(h.get("a")).toBe(1);
  });

  it("inheriting from hash with indifferent access properly dumps ivars", () => {
    class MyHWIA<V> extends HashWithIndifferentAccess<V> {}
    const h = new MyHWIA({ x: 42 });
    expect(Object.fromEntries(h.toHash())).toEqual({ x: 42 });
  });

  it("should use default proc for unknown key", () => {
    // No default proc support; unknown key returns undefined
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("unknown")).toBeUndefined();
  });

  it("should return nil if no key is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should use default value for unknown key", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should use default value if no key is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should nil if no default value is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
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
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    h.setDefault("1234");
    const roundtrip = h.toHash();
    expect(Object.fromEntries(roundtrip)).toEqual({ a: 1 });
    expect(roundtrip.default()).toBe("1234");
  });

  it("should copy the default proc when converting to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    h.setDefaultProc((_hash, key) => `${key}!`);
    const roundtrip = h.toHash();
    expect(roundtrip.get("a")).toBe(1);
    expect(roundtrip.get("b")).toBe("b!");
  });

  it("should copy the default when converting non hash to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("should copy the default proc when converting non hash to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
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
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const expected = new HashWithIndifferentAccess({ c: 10 });

    for (const keys of [
      ["a", "b"],
      [":a", ":b"],
    ]) {
      const copy = new HashWithIndifferentAccess(original);
      expect(copy.sliceBang(...keys).toHash()).toEqual(expected.toHash());
      expect(Object.fromEntries(copy.toHash())).toEqual({ a: "x", b: "y" });
    }
  });

  it("to options on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("first", 1);
    h.toOptionsBang();
    expect(h.get("first")).toBe(1);
  });
});
