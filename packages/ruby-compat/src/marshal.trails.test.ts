import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ArgumentError } from "./argument-error.js";
import { Hash } from "./hash.js";
import { Module, rbModConstSet } from "./include.js";
import { Marshal } from "./marshal.js";
import { rbSetClassPathString } from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { TypeError } from "./type-error.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./marshal.fixtures.json", import.meta.url), "utf8"),
) as Record<string, string>;

class Ary extends Array<unknown> {}
class Hsh extends Hash<unknown, unknown> {}

class Column {
  constructor(
    public name: string,
    public type: string,
  ) {}
}

class Shape {
  constructor(public kind: string) {}
}
const Geo = { name: "Geo", Shape };
rbSetClassPathString(Shape, Geo, "Shape");
const Kind = rbModConstSet(Geo, "Kind", new Module());

function hash<H extends Hash<unknown, unknown>>(pairs: [unknown, unknown][], h: H): H {
  for (const [key, value] of pairs) h.set(key, value);
  return h;
}

function hex(str: string): string {
  return Array.from(str, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

const shared = new Column("a", ":string");
const cycle: unknown[] = [];
cycle.push(cycle);

const VALUES: Record<string, unknown> = {
  nil: null,
  fixnums: [0, 122, 123, 65536, 2 ** 30 - 1, -1, -123, -124, -257, -(2 ** 30)],
  "bigfixnums then link": [2 ** 30, -(2 ** 30) - 1, 2n ** 62n - 1n, "a", "a"],
  "bignums then link": [2n ** 62n, -(2n ** 70n), "a", "a"],
  floats: [
    new Number(1),
    new Number(100),
    1e-5,
    0.00015,
    -123456789.125,
    new Number(0),
    new Number(-0),
    1.5,
    new Number(1.5),
  ],
  "float inf, -inf, nan": [Infinity, -Infinity, NaN],
  "string utf-8": "héllo ☃",
  "symbols and strings": [":a", "a", ":a", "a", ":é", ":é", true, false],
  array: [1, "a", undefined, [], {}],
  "array cycle": cycle,
  "array subclass": Ary.of(1),
  hash: hash(
    [
      ["a", 1],
      [":b", [2]],
      [3, new Map()],
    ],
    new Hash(),
  ),
  "hash string keys": { a: 1, b: null },
  "hash default": hash([["a", 1]], new Hash(5)),
  "hash default false": new Hash(false),
  "hash subclass": hash([["a", 1]], new Hsh()),
  "hash compare_by_identity": hash([[1, 2]], new Hash().compareByIdentity()),
  "class and module": [Column, Shape, Kind],
  "object nested path": new Shape(":circle"),
  "object link": [shared, shared],
  "schema cache": [
    20240101000000,
    new Map([["posts", [new Column("id", ":integer")]]]),
    new Map(),
    new Map([["posts", "id"]]),
    new Map([["posts", true]]),
    new Map(),
  ],
};

describe("Marshal.dump", () => {
  it("has a value for every fixture ruby dumped", () => {
    expect(Object.keys(VALUES)).toEqual(Object.keys(fixtures));
  });

  it.each(Object.entries(VALUES))("dumps the bytes ruby dumped: %s", (name, value) => {
    expect(hex(Marshal.dump(value))).toBe(fixtures[name]);
  });

  it("raises TypeError for a value with no dump arm", () => {
    expect(() => Marshal.dump(() => {})).toThrow(
      new TypeError("no _dump_data is defined for class Proc"),
    );
    expect(() => Marshal.dump([new Set()])).toThrow(
      new TypeError("no _dump_data is defined for class Set"),
    );
    class Tagged {
      [Symbol.toStringTag] = "Tagged";
    }
    expect(() => Marshal.dump(new Tagged())).toThrow(
      new TypeError("no _dump_data is defined for class Tagged"),
    );
  });

  it("raises TypeError for a Hash with a default proc", () => {
    expect(() => Marshal.dump(new Hash(() => 1))).toThrow(
      new TypeError("can't dump hash with default proc"),
    );
  });

  it("raises TypeError for an anonymous class and for an instance of one", () => {
    const klass = class {};
    Object.defineProperty(klass, "name", { value: "" });
    for (const obj of [klass, new klass()]) {
      expect(() => Marshal.dump(obj)).toThrow(TypeError);
      expect(() => Marshal.dump(obj)).toThrow(/^can't dump anonymous class #<Class:0x/);
    }
  });

  it("raises ArgumentError past the depth limit", () => {
    expect(Marshal.dump([[1]], 3)).toBe(Marshal.dump([[1]]));
    expect(() => Marshal.dump([[1]], 2)).toThrow(new ArgumentError("exceed depth limit"));
  });

  it("raises RuntimeError for an Array modified during the dump", () => {
    const ary: unknown[] = [];
    ary.push(
      Object.defineProperty(new Column("id", ":integer"), "name", { get: () => ary.push(1) }),
    );
    expect(() => Marshal.dump(ary)).toThrow(new RuntimeError("array modified during dump"));
  });

  it("raises TypeError for a length past 32 bits", () => {
    const ary = new Proxy([], { get: (t, k) => (k === "length" ? 2 ** 32 : Reflect.get(t, k)) });
    expect(() => Marshal.dump(ary)).toThrow(new TypeError("long too big to dump"));
  });
});
