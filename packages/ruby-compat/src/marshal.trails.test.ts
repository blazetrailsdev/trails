import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ArgumentError } from "./argument-error.js";
import { Hash } from "./hash.js";
import { Marshal } from "./marshal.js";
import { rbSetClassPathString } from "./object.js";
import { TypeError } from "./type-error.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./marshal.fixtures.json", import.meta.url), "utf8"),
) as Record<string, string>;

class Ary extends Array<unknown> {}

class Pt {
  constructor(
    public x: number,
    public name: string,
  ) {}
}

class Shape {
  constructor(public kind: string) {}
}
const Geo = { name: "Geo", Shape };
rbSetClassPathString(Shape, Geo, "Shape");

class SqlTypeMetadata {
  sqlType: string;
  type = ":integer";
  constructor(sqlType: string) {
    this.sqlType = sqlType;
  }
}

class Column {
  name: string;
  sqlTypeMetadata: SqlTypeMetadata;
  null: boolean;
  constructor(name: string, sqlType: string, isNull: boolean) {
    this.name = name;
    this.sqlTypeMetadata = new SqlTypeMetadata(sqlType);
    this.null = isNull;
  }
}

function hash(pairs: [unknown, unknown][], ifnone?: unknown): Hash<unknown, unknown> {
  const h = new Hash<unknown, unknown>(ifnone);
  for (const [key, value] of pairs) h.set(key, value);
  return h;
}

function hex(str: string): string {
  return Array.from(str, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

const shared = new Pt(1, "a");
const cycle: unknown[] = [];
cycle.push(cycle);

const VALUES: Record<string, unknown> = {
  nil: null,
  "fixnum 0": 0,
  "fixnum 122": 122,
  "fixnum 123": 123,
  "fixnum 65536": 65536,
  "fixnum 2**30 - 1": 2 ** 30 - 1,
  "fixnum -1": -1,
  "fixnum -123": -123,
  "fixnum -124": -124,
  "fixnum -257": -257,
  "fixnum -2**30": -(2 ** 30),
  "bigfixnum 2**30": 2 ** 30,
  "bigfixnum -2**30 - 1": -(2 ** 30) - 1,
  "bigfixnum 2**62 - 1": 2n ** 62n - 1n,
  "bigfixnum then link": [2 ** 40, "a", "a"],
  "bignum 2**62": 2n ** 62n,
  "bignum -2**70": -(2n ** 70n),
  "bignum then link": [2n ** 70n, "a", "a"],
  "float 1.0": new Number(1),
  "float 0.0 and -0.0": [new Number(0), new Number(-0)],
  "float 100.0": new Number(100),
  "float 1e-5": 1e-5,
  "float 0.00015": 0.00015,
  "float -123456789.125": -123456789.125,
  "float inf, -inf, nan": [Infinity, -Infinity, NaN],
  "float link": [1.5, new Number(1.5)],
  "string utf-8": "héllo ☃",
  "symbol utf-8": ":é",
  symlink: [":a", ":b", ":a"],
  array: [1, "a", undefined, [true, false], []],
  "array cycle": cycle,
  "array subclass": Ary.of(1),
  hash: hash([
    ["a", 1],
    [":b", [2]],
    [3, {}],
  ]),
  "hash default": hash([["a", 1]], 5),
  "hash compare_by_identity": hash([]).compareByIdentity().set(1, 2),
  "object nested path": new Shape(":circle"),
  "object link": [shared, shared],
  "schema cache": [
    20240101000000,
    new Map([
      ["posts", [new Column("id", "integer", false), new Column("title", "varchar", true)]],
    ]),
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
  });

  it("raises TypeError for a Hash with a default proc", () => {
    expect(() => Marshal.dump(new Hash(() => 1))).toThrow(
      new TypeError("can't dump hash with default proc"),
    );
  });

  it("raises TypeError for an instance of an anonymous class", () => {
    const klass = class {};
    Object.defineProperty(klass, "name", { value: "" });
    expect(() => Marshal.dump(new klass())).toThrow(TypeError);
    expect(() => Marshal.dump(new klass())).toThrow(/^can't dump anonymous class #<Class:0x/);
  });

  it("raises ArgumentError past the depth limit", () => {
    expect(Marshal.dump([[1]], 3)).toBe(Marshal.dump([[1]]));
    expect(() => Marshal.dump([[1]], 2)).toThrow(new ArgumentError("exceed depth limit"));
  });
});
