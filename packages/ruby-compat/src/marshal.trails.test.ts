import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ArgumentError } from "./argument-error.js";
import { Hash } from "./hash.js";
import { Marshal } from "./marshal.js";
import { rbSetClassPathString } from "./object.js";
import { TypeError } from "./type-error.js";
import { rbCObjectConstTbl, rbPathToClass } from "./variable.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./marshal.fixtures.json", import.meta.url), "utf8"),
) as Record<string, string>;

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

const CONSTANTS: Record<string, unknown> = { Pt, Geo, Column, SqlTypeMetadata };

function hash(pairs: [unknown, unknown][], ifnone?: unknown): Hash<unknown, unknown> {
  const h = new Hash<unknown, unknown>(ifnone);
  for (const [key, value] of pairs) h.set(key, value);
  return h;
}

function bytes(name: string): string {
  return fixtures[name].replace(/../g, (byte) => String.fromCharCode(Number.parseInt(byte, 16)));
}

function hex(str: string): string {
  return Array.from(str, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

const shared = new Pt(1, "a");

const ROUND_TRIPS: Record<string, unknown> = {
  nil: null,
  true: true,
  false: false,
  "fixnum 0": 0,
  "fixnum 1": 1,
  "fixnum 122": 122,
  "fixnum 123": 123,
  "fixnum 255": 255,
  "fixnum 256": 256,
  "fixnum 65535": 65535,
  "fixnum 65536": 65536,
  "fixnum 2**24": 2 ** 24,
  "fixnum 2**30 - 1": 2 ** 30 - 1,
  "fixnum -1": -1,
  "fixnum -123": -123,
  "fixnum -124": -124,
  "fixnum -256": -256,
  "fixnum -257": -257,
  "fixnum -65537": -65537,
  "fixnum -2**30": -(2 ** 30),
  "bigfixnum 2**30": 2 ** 30,
  "bigfixnum -2**30 - 1": -(2 ** 30) - 1,
  "bigfixnum 2**40": 2 ** 40,
  "bigfixnum 2**62 - 1": 2n ** 62n - 1n,
  "bigfixnum then link": [2 ** 40, "a", "a"],
  "bignum 2**62": 2n ** 62n,
  "bignum 2**70": 2n ** 70n,
  "bignum -2**70": -(2n ** 70n),
  "bignum then link": [2n ** 70n, "a", "a"],
  "float 1.5": 1.5,
  "float 1.0": new Number(1),
  "float -0.0": new Number(-0),
  "float 0.0 and -0.0": [new Number(0), new Number(-0)],
  "float 100.0": new Number(100),
  "float 1e20": new Number(1e20),
  "float 1e-5": 1e-5,
  "float 0.001": 0.001,
  "float 0.00015": 0.00015,
  "float -123456789.125": -123456789.125,
  "float inf": Infinity,
  "float -inf": -Infinity,
  "float nan": NaN,
  "float link": [1.5, 1.5],
  "string empty": "",
  "string abc": "abc",
  "string utf-8": "héllo ☃",
  "string link": ["a", "a"],
  symbol: ":name",
  "symbol utf-8": ":é",
  symlink: [":a", ":b", ":a"],
  "array empty": [],
  array: [1, "a", null, [true, false]],
  "hash empty": hash([]),
  hash: hash([
    ["a", 1],
    [":b", [2]],
    [3, null],
  ]),
  "hash default": hash([["a", 1]], 5),
  object: new Pt(1, "a"),
  "object nested path": new Shape(":circle"),
  "object link": [shared, shared],
  "schema cache": [
    20240101000000,
    hash([["posts", [new Column("id", "integer", false), new Column("title", "varchar", true)]]]),
    hash([]),
    hash([["posts", "id"]]),
    hash([["posts", true]]),
    hash([]),
  ],
};

describe("Marshal", () => {
  beforeAll(() => {
    for (const [path, value] of Object.entries(CONSTANTS)) rbCObjectConstTbl.set(path, value);
  });
  afterAll(() => {
    for (const path of Object.keys(CONSTANTS)) rbCObjectConstTbl.delete(path);
  });

  describe.each(Object.entries(ROUND_TRIPS))("%s", (name, value) => {
    it("loads the bytes ruby dumped", () => {
      expect(Marshal.load(bytes(name))).toEqual(value);
    });

    it("dumps the bytes ruby dumped", () => {
      expect(hex(Marshal.dump(value))).toBe(fixtures[name]);
    });
  });

  it("loads an ASCII-8BIT String as one character per byte", () => {
    expect(Marshal.load(bytes("string binary"))).toBe("Ã©ÿ");
  });

  it("loads a US-ASCII String through its E ivar", () => {
    expect(Marshal.load(bytes("string us-ascii"))).toBe("abc");
  });

  it("loads a String tagged by its encoding ivar", () => {
    expect(Marshal.load(bytes("string shift_jis"))).toBe("あ");
  });

  it("loads a Hash default", () => {
    const h = Marshal.load(bytes("hash default")) as Hash<string, number>;
    expect(h.default()).toBe(5);
    expect(h.get("missing")).toBe(5);
  });

  it("round-trips an Array that holds itself through TYPE_LINK", () => {
    const loaded = Marshal.load(bytes("array cycle")) as unknown[];
    expect(loaded[0]).toBe(loaded);
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(hex(Marshal.dump(cycle))).toBe(fixtures["array cycle"]);
  });

  it("loads a linked object as the same object", () => {
    const [a, b] = Marshal.load(bytes("object link")) as [Pt, Pt];
    expect(a).toBeInstanceOf(Pt);
    expect(b).toBe(a);
  });

  it("dumps a plain object and a Map as a Hash", () => {
    expect(Marshal.load(Marshal.dump({ a: 1 }))).toEqual(hash([["a", 1]]));
    expect(Marshal.load(Marshal.dump(new Map([["a", 1]])))).toEqual(hash([["a", 1]]));
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

  it("raises for an instance of a class its path does not reach", () => {
    class Unreachable {}
    expect(() => Marshal.dump(new Unreachable())).toThrow(
      new ArgumentError("undefined class/module Unreachable"),
    );
    rbCObjectConstTbl.set("Unreachable", class {});
    try {
      expect(() => Marshal.dump(new Unreachable())).toThrow(
        new TypeError("Unreachable can't be referred to"),
      );
    } finally {
      rbCObjectConstTbl.delete("Unreachable");
    }
  });

  it("raises ArgumentError past the depth limit", () => {
    expect(Marshal.dump([[1]], 3)).toBe(Marshal.dump([[1]]));
    expect(() => Marshal.dump([[1]], 2)).toThrow(new ArgumentError("exceed depth limit"));
  });

  it("raises TypeError for an incompatible format version", () => {
    expect(() => Marshal.load("\x04\x09i\x00")).toThrow(
      new TypeError(
        "incompatible marshal file format (can't be read)\n\tformat version 4.8 required; 4.9 given",
      ),
    );
    expect(() => Marshal.load("\x03\x00i\x00")).toThrow(TypeError);
    expect(() => Marshal.load(1 as unknown as string)).toThrow(
      new TypeError("instance of IO needed"),
    );
  });

  it("raises ArgumentError for malformed data", () => {
    expect(() => Marshal.load("\x04\b")).toThrow(new ArgumentError("marshal data too short"));
    expect(() => Marshal.load('\x04\b"\x0aabc')).toThrow(
      new ArgumentError("marshal data too short"),
    );
    expect(() => Marshal.load("\x04\b@\x00")).toThrow(
      new ArgumentError("dump format error (unlinked)"),
    );
    expect(() => Marshal.load("\x04\b;\x00")).toThrow(new ArgumentError("bad symbol"));
    expect(() => Marshal.load("\x04\bZ")).toThrow(new ArgumentError("dump format error(0x5a)"));
    expect(() => Marshal.load("\x04\bo\x22\x00\x00")).toThrow(
      new ArgumentError("dump format error for symbol(0x22)"),
    );
  });

  it("raises ArgumentError for a class path that does not resolve to a class", () => {
    expect(() => Marshal.load("\x04\bo:\x0dFoo::Bar\x00")).toThrow(
      new ArgumentError("undefined class/module Foo::"),
    );
    expect(() => Marshal.load("\x04\bo:\x08Geo\x00")).toThrow(
      new ArgumentError("Geo does not refer to class"),
    );
  });
});

describe("rbPathToClass", () => {
  beforeAll(() => {
    rbCObjectConstTbl.set("Geo", Geo);
    rbCObjectConstTbl.set("Geo::Registered", Pt);
    rbCObjectConstTbl.set("PI", 3.14);
  });
  afterAll(() => {
    for (const path of ["Geo", "Geo::Registered", "PI"]) rbCObjectConstTbl.delete(path);
  });

  it("walks each segment from the constant table, then the namespace's own constants", () => {
    expect(rbPathToClass("Geo")).toBe(Geo);
    expect(rbPathToClass("Geo::Shape")).toBe(Shape);
    expect(rbPathToClass("Geo::Registered")).toBe(Pt);
  });

  it("raises ArgumentError naming the path up to the segment that is undefined", () => {
    expect(() => rbPathToClass("Nope")).toThrow(new ArgumentError("undefined class/module Nope"));
    expect(() => rbPathToClass("Nope::Shape")).toThrow(
      new ArgumentError("undefined class/module Nope::"),
    );
    expect(() => rbPathToClass("Geo::Nope")).toThrow(
      new ArgumentError("undefined class/module Geo::Nope"),
    );
    expect(() => rbPathToClass("Geo:Shape")).toThrow(
      new ArgumentError("undefined class/module Geo"),
    );
    expect(() => rbPathToClass("Geo::toString")).toThrow(ArgumentError);
  });

  it("raises ArgumentError for an anonymous path", () => {
    expect(() => rbPathToClass("")).toThrow(new ArgumentError("can't retrieve anonymous class "));
    expect(() => rbPathToClass("#<Class:0x01>")).toThrow(
      new ArgumentError("can't retrieve anonymous class #<Class:0x01>"),
    );
  });

  it("raises TypeError for a constant that is not a class or module", () => {
    expect(() => rbPathToClass("PI")).toThrow(new TypeError("PI does not refer to class/module"));
  });
});
