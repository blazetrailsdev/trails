import { describe, expect, it } from "vitest";
import {
  Hash,
  deleteIf,
  dup,
  eachKey,
  eachPair,
  except,
  fetch,
  hasKey,
  merge,
  mergeBang,
  reject,
  slice,
  transformValues,
  update,
} from "./hash.js";
import { KeyError } from "./key-error.js";

describe("Hash#fetch", () => {
  it("returns a stored null rather than the default", () => {
    expect(fetch({ offset: null }, "offset", 0)).toBeNull();
    expect(fetch({ offset: undefined }, "offset", 0)).toBeUndefined();
  });

  it("returns a stored false rather than the default", () => {
    expect(fetch({ verbose: false }, "verbose", true)).toBe(false);
  });

  it("does not read an inherited JavaScript property as a stored key", () => {
    expect(fetch({}, "toString", "default")).toBe("default");
    expect(() => fetch({}, "toString")).toThrow('key not found: "toString"');
    expect(hasKey({}, "toString")).toBe(false);
  });

  it("returns the default for an absent key", () => {
    expect(fetch({}, "offset", 0)).toBe(0);
  });

  it("raises KeyError with the quoted key when no default is given", () => {
    expect(() => fetch({}, "expression")).toThrow(KeyError);
    expect(() => fetch({}, "expression")).toThrow('key not found: "expression"');
    expect(() => fetch({}, ":expression")).toThrow("key not found: :expression");
  });

  it("ellipsizes a description past 65 characters, as rb_str_ellipsize does", () => {
    expect(() => fetch({}, "k".repeat(80))).toThrow(`key not found: "${"k".repeat(61)}...`);
  });
});

describe("Hash#key?", () => {
  it("is true for a stored null and false for an absent key", () => {
    expect(hasKey({ offset: null }, "offset")).toBe(true);
    expect(hasKey({}, "offset")).toBe(false);
  });
});

describe("Hash#merge", () => {
  it("returns a new hash and leaves the receiver untouched", () => {
    const defaults = { controller: "photos", action: "index" };
    expect(merge(defaults, { action: "show" })).toEqual({ controller: "photos", action: "show" });
    expect(defaults).toEqual({ controller: "photos", action: "index" });
  });

  it("applies each argument in turn", () => {
    expect(merge({ a: 1 }, { b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
});

describe("Hash#update", () => {
  it("mutates the receiver and returns it", () => {
    const defaults: Record<string, unknown> = { controller: "photos" };
    expect(update(defaults, { action: "show" })).toBe(defaults);
    expect(defaults).toEqual({ controller: "photos", action: "show" });
  });

  it("is the same body as merge!", () => {
    expect(mergeBang).toBe(update);
  });
});

describe("Hash#delete_if", () => {
  it("mutates the receiver and returns it", () => {
    const hash: Record<string, number> = { foo: 0, bar: 1, baz: 2 };
    expect(deleteIf(hash, (_k, v) => v > 0)).toBe(hash);
    expect(hash).toEqual({ foo: 0 });
  });

  it("keeps a pair whose block answers nil or false, and drops one answering 0", () => {
    expect(
      deleteIf({ a: 1, b: 2, c: 3 }, (k) => (k === "a" ? 0 : k === "b" ? null : false)),
    ).toEqual({
      b: 2,
      c: 3,
    });
  });
});

describe("Hash#reject", () => {
  it("returns a new hash and leaves the receiver untouched", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(reject(hash, (k) => k.startsWith("b"))).toEqual({ foo: 0 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });
});

describe("Hash#each_pair", () => {
  it("yields each key and value and returns the receiver", () => {
    const hash = { foo: 0, bar: 1 };
    const seen: [string, number][] = [];
    expect(eachPair(hash, (k, v) => seen.push([k, v]))).toBe(hash);
    expect(seen).toEqual([
      ["foo", 0],
      ["bar", 1],
    ]);
  });
});

describe("Hash#each_key", () => {
  it("yields each key and returns the receiver", () => {
    const hash = { foo: 0, bar: 1 };
    const seen: string[] = [];
    expect(eachKey(hash, (k) => seen.push(k))).toBe(hash);
    expect(seen).toEqual(["foo", "bar"]);
  });
});

describe("Hash#transform_values", () => {
  it("returns a new hash with the same keys", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(transformValues(hash, (v) => v * 100)).toEqual({ foo: 0, bar: 100, baz: 200 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });
});

describe("Hash#slice", () => {
  it("returns the entries for the given keys, in argument order", () => {
    expect(Object.entries(slice({ foo: 0, bar: 1, baz: 2 }, "baz", "foo"))).toEqual([
      ["baz", 2],
      ["foo", 0],
    ]);
  });

  it("ignores keys that are not found, and keeps a stored undefined", () => {
    expect(slice({ foo: undefined }, "foo", "nope")).toEqual({ foo: undefined });
    expect(hasKey(slice({ foo: undefined }, "foo", "nope"), "nope")).toBe(false);
  });
});

describe("Hash#except", () => {
  it("returns a new hash excluding the given keys", () => {
    const hash = { a: 100, b: 200, c: 300 };
    expect(except(hash, "a")).toEqual({ b: 200, c: 300 });
    expect(hash).toEqual({ a: 100, b: 200, c: 300 });
  });
});

describe("Hash#default", () => {
  it("returns the default value for every miss", () => {
    const hash = new Hash<string, number>(0);
    expect(hash.get("nope")).toBe(0);
    expect(hash.default()).toBe(0);
    expect(hash.defaultProc()).toBeUndefined();
  });

  it("runs the default_proc with the hash and the missing key", () => {
    const hash = new Hash<string, string>((h, key) => h.set(key, `No key ${key}`).get(key)!);
    hash.set("foo", "Hello");
    expect(hash.get("foo")).toBe("Hello");
    expect(hash.default("foo")).toBe("No key foo");
    expect(hash.get("bar")).toBe("No key bar");
    expect(hash.has("bar")).toBe(true);
  });

  it("returns nil from the no-argument arm when a default_proc is stored", () => {
    const hash = new Hash<string, number>(() => 1);
    expect(hash.default()).toBeUndefined();
  });

  it("clears the default_proc on a default= write", () => {
    const hash = new Hash<string, number>(() => 1);
    hash.setDefault(9);
    expect(hash.defaultProc()).toBeUndefined();
    expect(hash.get("nope")).toBe(9);
  });

  it("distinguishes a key equal only by string coercion", () => {
    const hash = new Hash<unknown, string>("miss");
    hash.set(1, "integer");
    expect(hash.get("1")).toBe("miss");
    expect(hash.get(1)).toBe("integer");
  });

  it("carries the default over a dup, as hash_dup does", () => {
    const hash = new Hash<string, number>(7);
    hash.set("a", 1);
    const copy = dup(hash);
    copy.set("b", 2);
    expect(copy.get("a")).toBe(1);
    expect(copy.get("miss")).toBe(7);
    expect(hash.has("b")).toBe(false);
  });

  it("carries the default_proc over a dup, as the RHASH_PROC_DEFAULT flag does", () => {
    const hash = new Hash<string, string>((_h, key) => `made ${String(key)}`);
    const copy = dup(hash);
    expect(copy.get("x")).toBe("made x");
    expect(copy.default()).toBeUndefined();
  });

  it("dups a plain object into a new object", () => {
    const hash = { a: 1 };
    const copy = dup(hash);
    copy.a = 2;
    expect(hash.a).toBe(1);
  });
});
