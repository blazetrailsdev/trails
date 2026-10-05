import { Enumerator } from "./enumerator.js";
import { describe, expect, it } from "vitest";
import {
  Hash,
  block,
  type ConflictBlock,
  deleteIf,
  dup,
  eachKey,
  eachValue,
  eachPair,
  inspect,
  except,
  fetch,
  hasKey,
  hashAref,
  hashAset,
  hashDelete,
  isInclude,
  keepIf,
  merge,
  mergeBang,
  reject,
  slice,
  keys,
  transformValues,
  update,
  valuesAt,
} from "./hash.js";
import { KeyError } from "./key-error.js";
import { FrozenError } from "./frozen-error.js";
import { IndexError } from "./index-error.js";
import { RuntimeError } from "./runtime-error.js";

describe("Hash#fetch", () => {
  it("looks up an object key in a Map, keeping a stored nil or false", () => {
    const key = {};
    expect(fetch(new Map([[key, null]]), key, 0)).toBeNull();
    expect(fetch(new Map([[key, false]]), key, true)).toBe(false);
    expect(fetch(new Map<object, number>(), key, 0)).toBe(0);
  });

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

  it("sets the receiver and key on the KeyError, as rb_key_err_raise does", () => {
    const hash = { a: 1 };
    let error: unknown;
    try {
      fetch(hash, "b");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(IndexError);
    expect((error as KeyError).receiver()).toBe(hash);
    expect((error as KeyError).key()).toBe("b");
  });

  it("ellipsizes a description past 65 characters, as rb_str_ellipsize does", () => {
    expect(() => fetch({}, "k".repeat(80))).toThrow(`key not found: "${"k".repeat(61)}...`);
  });
});

describe("Hash#fetch with a block", () => {
  it("yields the missing key and returns what the block returns", () => {
    const keys: string[] = [];
    expect(
      fetch(
        { a: 1 },
        "b",
        block((key) => (keys.push(key), 42)),
      ),
    ).toBe(42);
    expect(keys).toEqual(["b"]);
  });

  it("does not yield when the key is stored, even for a stored undefined", () => {
    expect(
      fetch(
        { a: undefined },
        "a",
        block(() => "yielded"),
      ),
    ).toBeUndefined();
  });

  it("keeps a callable default as a default when it is not marked a block", () => {
    const fallback = () => "called";
    expect(fetch<unknown>({}, "a", fallback)).toBe(fallback);
  });
});

describe("Hash#[] and Hash#[]= on a non-Hash receiver", () => {
  class Store {
    seen: Record<string, unknown> = {};
    get(key: string): unknown {
      return `got ${key}`;
    }
    set(key: string, value: unknown): void {
      this.seen[key] = value;
    }
    eachValue(block: (value: unknown) => void): void {
      block("each");
    }
    transformValues(block: (value: unknown) => unknown): Record<string, unknown> {
      return { a: block("value") };
    }
    except(...keys: string[]): Record<string, unknown> {
      return { excepted: keys };
    }
  }

  it("sends [] and []= to the receiver's own get and set", () => {
    const store = new Store();
    expect(hashAref(store, "a")).toBe("got a");
    expect(hashAset(store, "a", 1)).toBe(1);
    expect(store.seen).toEqual({ a: 1 });
  });

  it("sends each_value, transform_values and except to the receiver", () => {
    const store = new Store();
    const yielded: unknown[] = [];
    eachValue(store, (value) => yielded.push(value));
    expect(yielded).toEqual(["each"]);
    expect(transformValues(store, (value) => `${String(value)}!`)).toEqual({ a: "value!" });
    expect(except(store, "x", "y")).toEqual({ excepted: ["x", "y"] });
  });

  it("answers a plain-object hash's default on a miss, and nil for an Object.prototype member", () => {
    const withDefault = new Proxy({ a: 1 } as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !Object.hasOwn(target, prop)) return "default";
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(hashAref(withDefault, "a")).toBe(1);
    expect(hashAref(withDefault, "b")).toBe("default");
    expect(hashAref(withDefault, "toString")).toBe("default");
    const nullProto = new Proxy(Object.create(null) as Record<string, unknown>, {
      get: (target, prop) => (Object.hasOwn(target, prop) ? target[prop as string] : "default"),
    });
    expect(hashAref(nullProto, "toString")).toBe("default");
    for (const key of ["b", "toString", "constructor", "__proto__"]) {
      expect(hashAref({ a: 1 }, key)).toBeNull();
      expect(hashAref(Object.create(null) as object, key)).toBeNull();
    }
  });

  it("lets a receiver's get read its own plain store through hashAref", () => {
    class Wrapper {
      store: Record<string, unknown> = { get: "data" };
      get(key: string): unknown {
        return hashAref(this.store, key);
      }
    }
    expect(hashAref(new Wrapper(), "get")).toBe("data");
    expect(hashAref(new Wrapper(), "missing")).toBeNull();
  });

  it("reads a plain hash's own get and set keys as data", () => {
    const hash: Record<string, unknown> = { get: () => "no", set: 1 };
    expect(hashAref(hash, "missing")).toBeNull();
    expect(hashAset(hash, "set", 2)).toBe(2);
    expect(hash.set).toBe(2);
  });
});

describe("Hash#key?", () => {
  it("is true for a stored null and false for an absent key", () => {
    expect(hasKey({ offset: null }, "offset")).toBe(true);
    expect(hasKey({}, "offset")).toBe(false);
  });

  it("reads a Map-backed Hash's table, as each_key walks it", () => {
    const hash = new Map<string, unknown>([["offset", null]]);
    expect(hasKey(hash, "offset")).toBe(true);
    expect(hasKey(hash, "size")).toBe(false);
    expect(eachKey(hash as never)).toEqual(["offset"]);
    const seen: string[] = [];
    expect(eachKey(hash as never, (key) => seen.push(key))).toBe(hash);
    expect(seen).toEqual(["offset"]);
  });
});

describe("Hash#include?", () => {
  it("is Hash#key?", () => {
    expect(isInclude({ offset: null }, "offset")).toBe(true);
    expect(isInclude({}, "toString")).toBe(false);
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

  it("carries a __proto__ key across as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const merged = merge(hash, { a: 2 });
    expect(hasKey(merged, "__proto__")).toBe(true);
    expect("toString" in merged).toBe(false);
    expect(Object.getPrototypeOf(merged)).toBeNull();
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

  it("applies a Hash argument, as rb_hash_update's rb_to_hash_type does", () => {
    const defaults: Record<string, unknown> = { type: "submit" };
    const options = new Hash<string, unknown>();
    options.set("class", "extra");
    update(defaults, options);
    expect(defaults).toEqual({ type: "submit", class: "extra" });
  });
});

describe("Hash#merge! with a conflict block", () => {
  it("yields the key, the receiver's value and the argument's, and stores the result", () => {
    const yielded: unknown[][] = [];
    const hash = { a: 1, b: 2 };
    mergeBang(
      hash,
      { b: 20, c: 30 },
      block((key: string, oldValue: number, newValue: number) => {
        yielded.push([key, oldValue, newValue]);
        return oldValue;
      }),
    );
    expect(hash).toEqual({ a: 1, b: 2, c: 30 });
    expect(yielded).toEqual([["b", 2, 20]]);
  });

  it("detects the block by its mark, not by the argument's type", () => {
    const hash = { a: 1 };
    const unmarked = ((_key: string, left: number): number =>
      left) as unknown as ConflictBlock<number>;
    update(hash, { a: 2 }, unmarked);
    expect(hash).toEqual({ a: 2 });
  });

  it("leaves merge's copy semantics alone", () => {
    const hash = { a: 1 };
    expect(
      merge(
        hash,
        { a: 2 },
        block((_key: string, left: number) => left),
      ),
    ).toEqual({ a: 1 });
    expect(hash).toEqual({ a: 1 });
  });
});

describe("Hash#freeze", () => {
  it("raises FrozenError from every mutator once frozen", () => {
    const hash = new Hash<string, number>();
    hash.set("a", 1);
    expect(hash.isFrozen()).toBe(false);
    expect(hash.freeze()).toBe(hash);
    expect(hash.isFrozen()).toBe(true);
    expect(() => hash.set("b", 2)).toThrow(FrozenError);
    expect(() => hash.set("b", 2)).toThrow('can\'t modify frozen Hash: {"a"=>1}');
    expect(() => hash.delete("a")).toThrow(FrozenError);
    expect(() => hash.clear()).toThrow(FrozenError);
    expect(() => hash.setDefault(0)).toThrow(FrozenError);
    expect(hash.get("a")).toBe(1);
  });

  it("sets the frozen hash as the FrozenError's receiver", () => {
    const hash = new Hash<string, number>().freeze();
    let error: unknown;
    try {
      hash.clear();
    } catch (e) {
      error = e;
    }
    expect((error as FrozenError).receiver()).toBe(hash);
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

describe("Hash#keep_if", () => {
  it("mutates and returns the receiver, keeping the pairs the block answers truthily for", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(keepIf(hash, (k) => k.startsWith("b"))).toBe(hash);
    expect(hash).toEqual({ bar: 1, baz: 2 });
  });

  it("drops a pair whose block answers nil or false, and keeps one answering 0", () => {
    expect(keepIf({ a: 1, b: 2, c: 3 }, (k) => (k === "a" ? 0 : k === "b" ? null : false))).toEqual(
      { a: 1 },
    );
  });
});

describe("Hash#reject", () => {
  it("returns a new hash and leaves the receiver untouched", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(reject(hash, (k) => k.startsWith("b"))).toEqual({ foo: 0 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });

  it("carries a __proto__ key across as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const rejected = reject(hash, (k) => k === "nope");
    expect(hasKey(rejected, "__proto__")).toBe(true);
    expect("toString" in rejected).toBe(false);
    expect(Object.getPrototypeOf(rejected)).toBeNull();
  });
});

describe("Hash#each_pair", () => {
  it("sends a receiver that is not a Hash its own each", () => {
    class Wrapper {
      each(block: (key: string, value: number) => void): void {
        block("foo", 0);
      }
    }
    const wrapper = new Wrapper() as unknown as Record<string, number>;
    const seen: [string, number][] = [];
    expect(eachPair(wrapper, (k, v) => seen.push([k, v]))).toBe(wrapper);
    expect(seen).toEqual([["foo", 0]]);
  });

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

  it("enumerates the keys when no block is given", () => {
    const hash = { foo: 0, bar: 1 };
    expect(eachKey(hash).filter((k) => hash[k as keyof typeof hash] > 0)).toEqual(["bar"]);
  });
});

describe("Hash#transform_values", () => {
  it("returns a new hash with the same keys", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(transformValues(hash, (v) => v * 100)).toEqual({ foo: 0, bar: 100, baz: 200 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });

  it("answers a bare Hash for a Hash receiver, without its default", () => {
    const hash = new Hash<string, number>(7);
    hash.set("foo", 1);
    const result = transformValues(hash, (v) => v * 100);
    expect(result).toBeInstanceOf(Hash);
    expect([...result]).toEqual([["foo", 100]]);
    expect(result.get("bar")).toBeUndefined();
  });
});

describe("a Hash send to a receiver that defines the method itself", () => {
  class Row {
    constructor(private readonly row: Record<string, unknown>) {}
    isKey(column: string): boolean {
      return column.toLowerCase() in this.row;
    }
    keys(): string[] {
      return Object.keys(this.row);
    }
    eachKey(block: (key: string) => void): void {
      this.keys().forEach(block);
    }
    fetch(column: string, fallback?: () => unknown): unknown {
      return this.isKey(column) ? this.row[column.toLowerCase()] : fallback?.();
    }
  }
  const row = new Row({ id: 1, name: null });

  it("reaches the receiver's own fetch, key?, keys and each_key", () => {
    let missed = false;
    const miss = block(() => {
      missed = true;
    });
    expect(fetch(row, "NAME", miss)).toBeNull();
    expect(missed).toBe(false);
    expect(fetch(row, "age", miss)).toBeUndefined();
    expect(missed).toBe(true);
    expect([hasKey(row, "ID"), hasKey(row, "age")]).toEqual([true, false]);
    expect(keys(row)).toEqual(["id", "name"]);
    const seen: string[] = [];
    expect(eachKey(row, (key) => seen.push(key))).toBeUndefined();
    expect(seen).toEqual(["id", "name"]);
  });

  it("reads a plain object's fetch, isKey and keys entries as Hash data", () => {
    const hash = { fetch: () => 1, isKey: () => true, keys: () => [] };
    expect(hasKey(hash, "missing")).toBe(false);
    expect(keys(hash)).toEqual(["fetch", "isKey", "keys"]);
    expect(fetch(hash, "missing", 2)).toBe(2);
  });

  it("answers the keys of a Map", () => {
    expect(keys(new Map([["a", 1]]))).toEqual(["a"]);
  });
});

describe("Hash and JSON.stringify", () => {
  it("writes each pair, where a bare Map stringifies as {}", () => {
    const hash = new Hash<string, number[]>();
    hash.set("name", [1]);
    expect(JSON.stringify({ errors: hash })).toBe('{"errors":{"name":[1]}}');
  });
});

describe("Hash#slice", () => {
  it("returns the entries for the given keys, in argument order", () => {
    expect(Object.entries(slice({ foo: 0, bar: 1, baz: 2 }, "baz", "foo"))).toEqual([
      ["baz", 2],
      ["foo", 0],
    ]);
  });

  it("keeps a __proto__ key as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    expect(hasKey(slice(hash, "__proto__"), "__proto__")).toBe(true);
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

  it("keeps a __proto__ key as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    expect(hasKey(except(hash, "nope"), "__proto__")).toBe(true);
  });
});

describe("Hash#except on a Map-backed Hash", () => {
  it("returns a new bare Hash excluding the given keys", () => {
    class Sub<K, V> extends Hash<K, V> {}
    const hash = new Sub<string, number>();
    hash.set("a", 100).set("b", 200).set("c", 300);
    const result = except(hash, "a", "nope");
    expect(result.constructor).toBe(Hash);
    expect([...result]).toEqual([
      ["b", 200],
      ["c", 300],
    ]);
    expect(hash.size).toBe(3);
  });

  it("keeps the receiver's compare_by_identity table", () => {
    const hash = new Hash<unknown, number>().compareByIdentity();
    const key = ["a"];
    hash.set(key, 1);
    expect(except(hash, ["a"]).size).toBe(1);
    expect(except(hash, key).size).toBe(0);
  });
});

describe("Hash#dup on a Map-backed Hash", () => {
  it("copies the receiver's own table into a new hash of its class", () => {
    class Sub<K, V> extends Hash<K, V> {}
    const hash = new Sub<string, number>();
    hash.set("a", 1).set("b", 2);
    const copy = dup(hash);
    expect(copy).not.toBe(hash);
    expect(copy).toBeInstanceOf(Sub);
    expect([...copy]).toEqual([...hash]);
  });
});

describe("Hash#each_value on a Map-backed Hash", () => {
  it("yields each value alone and returns the receiver", () => {
    const hash = new Hash<string, number>();
    hash.set("a", 1).set("b", 2);
    const seen: number[] = [];
    expect(eachValue(hash, (v) => seen.push(v))).toBe(hash);
    expect(seen).toEqual([1, 2]);
  });

  it("enumerates the values when no block is given", () => {
    const hash = new Hash<string, number>();
    hash.set("a", 1).set("b", 2);
    expect([...eachValue(hash)]).toEqual([1, 2]);
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

  class Upcased extends Hash<string, number> {
    override set(key: string, value: number): this {
      return super.set(key.toUpperCase(), value);
    }
  }

  it("dups a Hash subclass into its own class without going through its []=, as rb_hash_dup does", () => {
    const hash = new Upcased();
    Hash.prototype.set.call(hash, "a", 1);

    expect(dup(hash)).toBeInstanceOf(Upcased);
    expect([...dup(hash)]).toEqual([["a", 1]]);
    expect(hash.toH().constructor).toBe(Hash);
  });

  it("replaces the table and the default without going through a subclass's []=, as rb_hash_replace does", () => {
    const hash = new Upcased().set("stale", 0);
    const other = new Hash<string, number>(7).set("a", 1);

    expect(hash.replace(other)).toBe(hash);
    expect([[...hash], hash.default()]).toEqual([[["a", 1]], 7]);
    expect([...hash.replace({ b: 2 })]).toEqual([["b", 2]]);
    expect(() => hash.freeze().replace(other)).toThrow(FrozenError);
  });

  it("slices and updates a Hash receiver, the conflict block included", () => {
    const hash = new Hash<string, number>().set("a", 1).set("b", 2);

    const result = slice(hash, "b", "missing", "a");
    expect([result.constructor, [...result]]).toEqual([
      Hash,
      [
        ["b", 2],
        ["a", 1],
      ],
    ]);
    expect(update(hash, { a: 2, c: 3 })).toBe(hash);
    update(
      hash,
      new Map([["a", 10]]),
      block((_key: string, oldValue: number, newValue: number) => oldValue + newValue),
    );
    expect([...hash]).toEqual([
      ["a", 12],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("dups a plain object into a new object", () => {
    const hash = { a: 1 };
    const copy = dup(hash);
    copy.a = 2;
    expect(hash.a).toBe(1);
  });

  it("dups a plain object without ancestors, as rb_hash_dup does", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const copy = dup(hash);
    expect(hasKey(copy, "__proto__")).toBe(true);
    expect("toString" in copy).toBe(false);
    expect(Object.getPrototypeOf(copy)).toBeNull();
  });

  describe("inspect", () => {
    it("renders an empty hash as {}", () => {
      expect(inspect({})).toBe("{}");
    });

    it("renders keys and values as rb_inspect does, joined by =>", () => {
      expect(inspect({ a: 1, b: [1, null], c: { d: true }, e: ":sym" })).toBe(
        '{"a"=>1, "b"=>[1, nil], "c"=>{"d"=>true}, "e"=>:sym}',
      );
      expect(inspect({ f: 1.5, n: null, s: ":sym", empty: [] })).toBe(
        '{"f"=>1.5, "n"=>nil, "s"=>:sym, "empty"=>[]}',
      );
    });

    it("escapes strings as String#inspect does", () => {
      expect(inspect({ q: 'a"b\\c', t: "tab\there", esc: "\n\r\f\v\b\u0007\u001b" })).toBe(
        '{"q"=>"a\\"b\\\\c", "t"=>"tab\\there", "esc"=>"\\n\\r\\f\\v\\b\\a\\e"}',
      );
      expect(inspect({ nul: "\u0000", soh: "\u0001", del: "\u007f", nel: "\u0085" })).toBe(
        '{"nul"=>"\\u0000", "soh"=>"\\u0001", "del"=>"\\u007F", "nel"=>"\\u0085"}',
      );
      expect(inspect({ uni: "\u00e9\u{1f600}\u200b\ufffd" })).toBe(
        '{"uni"=>"\u00e9\u{1f600}\u200b\ufffd"}',
      );
      expect(inspect({ hash: "#z", interp: "#{y", dollar: "#$x", at: "#@y" })).toBe(
        '{"hash"=>"#z", "interp"=>"\\#{y", "dollar"=>"\\#$x", "at"=>"\\#@y"}',
      );
    });

    it("renders a recursive hash or array as MRI's recursive slot", () => {
      const hash: Record<string, unknown> = { a: 1 };
      hash.self = hash;
      expect(inspect(hash)).toBe('{"a"=>1, "self"=>{...}}');

      const ary: unknown[] = [1];
      ary.push(ary);
      expect(inspect({ ary })).toBe('{"ary"=>[1, [...]]}');
    });
  });
});

describe("eachValue", () => {
  it("yields each value alone and returns the receiver", () => {
    const h = { a: 1, b: 2 };
    const seen: number[] = [];
    expect(eachValue(h, (v) => seen.push(v))).toBe(h);
    expect(seen).toEqual([1, 2]);
  });

  it("enumerates the values when no block is given", () => {
    const enumerator = eachValue({ a: 1, b: null });
    expect(enumerator).toBeInstanceOf(Enumerator);
    expect([...enumerator]).toEqual([1, null]);
  });
});

describe("hashDelete", () => {
  it("removes the entry and returns its stored value, including a stored nil", () => {
    const hash: Record<string, number | null> = { foo: 0, bar: null };
    expect(hashDelete(hash, "foo")).toBe(0);
    expect(hashDelete(hash, "bar")).toBeNull();
    expect(hash).toEqual({});
  });

  it("returns nil for an absent key, or the block's value for it", () => {
    const hash: Record<string, number> = { foo: 0 };
    expect(hashDelete(hash, "baz")).toBeNull();
    expect(hashDelete(hash, "baz", (key) => `no ${key}`)).toBe("no baz");
    expect(hash).toEqual({ foo: 0 });
  });
});

describe("hashDelete on a Map", () => {
  it("removes the entry and returns its stored value, or nil for an absent key", () => {
    const hash = new Map<string, number>([["foo", 0]]);
    expect(hashDelete(hash, "foo")).toBe(0);
    expect(hashDelete(hash, "foo")).toBeNull();
    expect(hashDelete(hash, "foo", (key) => `no ${key}`)).toBe("no foo");
    expect(hash.size).toBe(0);
  });
});

describe("hashAref / hashAset", () => {
  it("reads a stored value and answers nil for an absent key, on either hash", () => {
    const key = () => {};
    expect(hashAref({ foo: 0 }, "foo")).toBe(0);
    expect(hashAref({ foo: 0 }, "toString")).toBeNull();
    expect(hashAref(new Map<unknown, unknown>([[key, "v"]]), key)).toBe("v");
    expect(hashAref(new Map(), "foo")).toBeNull();
  });

  it("stores the pair on either hash and returns the value", () => {
    const hash: Record<string, number> = {};
    const map = new Map<unknown, unknown>();
    expect(hashAset(hash, "foo", 1)).toBe(1);
    expect(hashAset(map, "foo", 1)).toBe(1);
    expect(hash).toEqual({ foo: 1 });
    expect([...map]).toEqual([["foo", 1]]);
  });

  it("raises FrozenError storing into a frozen hash", () => {
    expect(() => hashAset(Object.freeze({}), "foo", 1)).toThrow(FrozenError);
  });
});

describe("Array#values_at", () => {
  it("reads each index, counting a negative one from the end", () => {
    expect(valuesAt("a.b".split("."), -2, -1)).toEqual(["a", "b"]);
    expect(valuesAt("b".split("."), -2, -1)).toEqual([undefined, "b"]);
    expect(valuesAt([1, 2, 3], 0, 5, -4, -1)).toEqual([1, undefined, undefined, 3]);
  });
});

describe("Hash keys by eql?", () => {
  it("finds an Integer key through either of its JS seats", () => {
    const h = new Hash<unknown, string>();
    h.set(1n, "one");
    expect(h.get(1)).toBe("one");
    expect(h.has(1n)).toBe(true);
    h.set(1, "uno");
    expect(h.size).toBe(1);
    h.set([2, 3], "pair");
    expect(h.get([2n, 3])).toBe("pair");
    expect(h.delete(1n)).toBe("uno");
    expect(h.has(1)).toBe(false);
  });

  it("collapses equal Array keys into one entry and keeps the first key", () => {
    const first = ["a", 1];
    const h = new Hash<unknown[], string>();
    h.set(first, "x");
    h.set(["a", 1], "y");
    expect(h.size).toBe(1);
    expect(h.keys()[0]).toBe(first);
    expect(h.get(["a", 1])).toBe("y");
    expect(h.has(["a", 1])).toBe(true);
    expect(h.delete(["a", 1])).toBe("y");
    expect(h.has(first)).toBe(false);
  });
});

class EqlKey {
  constructor(readonly id: number) {}
  hash(): number {
    return this.id;
  }
  eql(other: unknown): boolean {
    return other instanceof EqlKey && other.id === this.id;
  }
}

describe("Hash keyed on an object answering hash / eql?", () => {
  it("finds the entry through a different but eql? key", () => {
    const h = new Hash<EqlKey, string>();
    h.set(new EqlKey(1), "one");
    expect(h.get(new EqlKey(1))).toBe("one");
    expect(h.has(new EqlKey(2))).toBe(false);
  });

  it("separates keys that share a hash but are not eql?", () => {
    const h = new Hash<unknown, string>();
    h.set(new EqlKey(1), "key");
    h.set({ hash: () => 1, eql: () => false }, "other");
    expect(h.size).toBe(2);
    expect(h.get(new EqlKey(1))).toBe("key");
  });

  it("counts eql? keys together under Hash.new(0)", () => {
    const h = new Hash<EqlKey, number>(0);
    for (const key of [new EqlKey(1), new EqlKey(1), new EqlKey(2)]) {
      h.set(key, h.get(key)! + 1);
    }
    expect(h.get(new EqlKey(1))).toBe(2);
    expect(h.get(new EqlKey(2))).toBe(1);
    expect(h.get(new EqlKey(3))).toBe(0);
    expect(h.size).toBe(2);
  });

  it("populates one entry per eql? key from a default_proc", () => {
    const h = new Hash<EqlKey, number[]>((hash, key) => {
      const made: number[] = [];
      hash.set(key, made);
      return made;
    });
    h.get(new EqlKey(1))!.push(1);
    h.get(new EqlKey(1))!.push(2);
    expect(h.size).toBe(1);
    expect(h.get(new EqlKey(1))).toEqual([1, 2]);
  });
});

describe("Hash#shift", () => {
  it("removes the first entry and returns it, nil once the hash is empty", () => {
    const first = [1];
    const h = new Hash<unknown, string>("default");
    h.set(first, "a");
    h.set("b", "b");
    expect(h.shift()).toEqual([first, "a"]);
    expect(h.has([1])).toBe(false);
    h.set([1], "again");
    expect(h.size).toBe(2);
    expect(h.shift()).toEqual(["b", "b"]);
    expect(h.shift()).toEqual([[1], "again"]);
    expect(h.shift()).toBeUndefined();
  });

  it("removes the first entry without looking its key up, so a key mutated since is shifted", () => {
    const key = [1];
    const h = new Hash<unknown[], string>();
    h.set(key, "a");
    key.push(2);
    expect(h.shift()).toEqual([[1, 2], "a"]);
    expect(h.size).toBe(0);
    h.set([1], "b");
    h.set([1], "c");
    expect(h.size).toBe(1);
  });

  it("shifts while the hash is being iterated", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const yielded: string[] = [];
    for (const [key] of h) {
      yielded.push(key);
      expect(h.shift()).toEqual(["a", 1]);
      break;
    }
    expect(yielded).toEqual(["a"]);
    expect(h.keys()).toEqual(["b"]);
  });

  it("raises FrozenError on a frozen hash, even an empty one", () => {
    expect(() => new Hash().freeze().shift()).toThrow(FrozenError);
  });
});

describe("Hash#compare_by_identity", () => {
  it("returns the receiver and answers compare_by_identity?", () => {
    const h = new Hash<unknown, number>();
    expect(h.isCompareByIdentity()).toBe(false);
    expect(h.compareByIdentity()).toBe(h);
    expect(h.isCompareByIdentity()).toBe(true);
  });

  it("keeps eql? keys as separate entries", () => {
    const first = [1];
    const h = new Hash<unknown, number>().compareByIdentity();
    h.set(first, 1);
    h.set([1], 2);
    expect(h.size).toBe(2);
    expect(h.get(first)).toBe(1);
    expect(h.get([1])).toBeUndefined();
    expect(h.has([1])).toBe(false);
    expect(h.delete([1])).toBeUndefined();
    expect(h.delete(first)).toBe(1);
    expect(h.size).toBe(1);
  });

  it("rehashes the stored keys, so an eql? key no longer finds them", () => {
    const stored = new EqlKey(1);
    const h = new Hash<EqlKey, number>(0);
    h.set(stored, 5);
    h.compareByIdentity();
    expect(h.get(new EqlKey(1))).toBe(0);
    expect(h.get(stored)).toBe(5);
    expect(h.delete(stored)).toBe(5);
    expect(h.size).toBe(0);
  });

  it("returns the default value for an eql? but not identical key", () => {
    const stored = new EqlKey(1);
    const h = new Hash<EqlKey, number>(0).compareByIdentity();
    h.set(stored, h.get(stored)! + 1);
    h.set(stored, h.get(stored)! + 1);
    expect(h.get(stored)).toBe(2);
    expect(h.get(new EqlKey(1))).toBe(0);
  });

  it("runs the default_proc once per identity", () => {
    const h = new Hash<EqlKey, number[]>((hash, key) => {
      const made: number[] = [];
      hash.set(key, made);
      return made;
    }).compareByIdentity();
    const stored = new EqlKey(1);
    h.get(stored)!.push(1);
    h.get(new EqlKey(1))!.push(2);
    expect(h.size).toBe(2);
    expect(h.get(stored)).toEqual([1]);
  });

  it("raises FrozenError on a frozen hash, and returns an identity hash as it is", () => {
    expect(() => new Hash().freeze().compareByIdentity()).toThrow(FrozenError);
    const h = new Hash().compareByIdentity().freeze();
    expect(h.compareByIdentity()).toBe(h);
  });

  it("raises RuntimeError during iteration, and not once the iteration has ended", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    eachPair(h, () => {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
      expect(() => h.compareByIdentity()).toThrow("compare_by_identity during iteration");
    });
    h.forEach(() => {
      h.forEach(() => {});
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    });
    for (const _pair of h) {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    }
    for (const _pair of h.entries()) {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    }
    expect(h.isCompareByIdentity()).toBe(false);
    expect(() =>
      eachPair(h, () => {
        throw new IndexError("stop");
      }),
    ).toThrow(IndexError);
    expect(h.compareByIdentity().isCompareByIdentity()).toBe(true);
  });

  it("lowers the level when a for…of breaks, and keeps it for a suspended iterator", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    for (const _pair of h) break;
    const [first] = h;
    expect(first).toEqual(["a", 1]);
    const enumerator = h[Symbol.iterator]();
    enumerator.next();
    expect(() => h.compareByIdentity()).toThrow("compare_by_identity during iteration");
    enumerator.return(undefined);
    expect(h.compareByIdentity().isCompareByIdentity()).toBe(true);
  });

  it("raises FrozenError rather than RuntimeError while iterating a frozen hash", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.freeze();
    eachPair(h, () => {
      expect(() => h.compareByIdentity()).toThrow(FrozenError);
    });
  });

  it("carries over a dup, as hash_copy copies the table's type", () => {
    const h = new Hash<unknown, number>().compareByIdentity();
    const copy = dup(h);
    expect(copy.isCompareByIdentity()).toBe(true);
    copy.set([1], 1);
    copy.set([1], 2);
    expect(copy.size).toBe(2);
  });

  it("stays an identity hash across clear", () => {
    const h = new Hash<unknown, number>().compareByIdentity();
    h.clear();
    h.set([1], 1);
    h.set([1], 2);
    expect(h.size).toBe(2);
  });
});

describe("block (a marked `&block`)", () => {
  it("keeps the block's arity and passes the receiver an instance_exec gives it", () => {
    const receiver = { name: "david" };
    const blk = block(function (this: { name: string }, greeting: string) {
      return `${greeting} ${this.name}`;
    });
    expect(blk.length).toBe(1);
    expect(blk.call(receiver, "hello")).toBe("hello david");
  });
});
