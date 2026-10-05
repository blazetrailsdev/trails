import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ArgumentError } from "./argument-error.js";
import { FrozenError } from "./frozen-error.js";
import { Hash } from "./hash.js";
import { Module, extend, rbDefineAllocFunc, rbModConstSet } from "./include.js";
import { Marshal, rbMarshalDefineCompat } from "./marshal.js";
import {
  rbModName,
  rbObjIvarGet,
  rbObjIvarSet,
  rbObjSingletonClass,
  rbSetClassPathString,
} from "./object.js";
import { Rational, ZeroDivisionError } from "./rational.js";
import { RuntimeError } from "./runtime-error.js";
import { TypeError } from "./type-error.js";
import { registerConstant, unregisterConstant } from "./variable.js";

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

class Cache {
  declare version: unknown;
  declare columns: unknown;

  constructor(version: unknown, columns: unknown) {
    this.version = version;
    this.columns = columns;
  }

  marshalDump(): unknown[] {
    return [this.version, this.columns];
  }

  marshalLoad(array: unknown[]): void {
    [this.version, this.columns] = array;
  }
}

class Point {
  constructor(public x: unknown) {}
}
class PointCompat {}
rbDefineAllocFunc(Point, (klass) => new klass(0));
rbMarshalDefineCompat(
  Point,
  PointCompat,
  (point) => {
    const compat = new PointCompat();
    rbObjIvarSet(compat, "@v", point.x);
    return compat;
  },
  (point, compat) => {
    point.x = rbObjIvarGet(compat, "@v");
  },
);

function hash<H extends Hash<unknown, unknown>>(pairs: [unknown, unknown][], h: H): H {
  for (const [key, value] of pairs) h.set(key, value);
  return h;
}

const CONSTANTS: Record<string, unknown> = { Ary, Hsh, Column, Cache, Geo, Hash, Point };

beforeAll(() => {
  for (const [name, value] of Object.entries(CONSTANTS)) registerConstant(name, value);
});
afterAll(() => {
  for (const [name, value] of Object.entries(CONSTANTS)) unregisterConstant(name, value);
});

function bytes(name: string): string {
  return fixtures[name].replace(/../g, (byte) => String.fromCharCode(Number.parseInt(byte, 16)));
}

function hex(str: string): string {
  return Array.from(str, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

const shared = new Column("a", ":string");
const cycle: unknown[] = [];
cycle.push(cycle);
const cache = new Cache(1, new Map([["posts", [shared]]]));
const half = new Rational(1, 2);

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
  "user marshal": [cache, cache],
  rational: [half, half, new Rational(-3, 4), new Rational(2n ** 70n, 3)],
  "schema cache": [
    20240101000000,
    new Map([["posts", [new Column("id", ":integer")]]]),
    new Map(),
    new Map([["posts", "id"]]),
    new Map([["posts", true]]),
    new Map(),
  ],
};

const LOADED: Record<string, unknown> = {
  floats: [...(VALUES.floats as unknown[]).slice(0, 8), 1.5],
  "string binary": "Ã©ÿ",
  "string us-ascii": "abc",
  "string shift_jis": "あ",
  array: [1, "a", null, [], new Hash()],
  hash: hash(
    [
      ["a", 1],
      [":b", [2]],
      [3, new Hash()],
    ],
    new Hash(),
  ),
  "hash string keys": hash(
    [
      ["a", 1],
      ["b", null],
    ],
    new Hash(),
  ),
  "user marshal": Array(2).fill(new Cache(1, hash([["posts", [shared]]], new Hash()))),
  "schema cache": [
    20240101000000,
    hash([["posts", [new Column("id", ":integer")]]], new Hash()),
    new Hash(),
    hash([["posts", "id"]], new Hash()),
    hash([["posts", true]], new Hash()),
    new Hash(),
  ],
};

describe("Marshal.dump", () => {
  it("has a value for every fixture ruby dumped", () => {
    expect(Object.keys({ ...VALUES, ...LOADED }).sort()).toEqual(Object.keys(fixtures).sort());
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

  it("raises TypeError for an object with singleton methods or singleton ivars", () => {
    const methods = new Shape(":circle");
    Object.assign(rbObjSingletonClass(methods).prototype, { area: () => 1 });
    const ivars = new Shape(":circle");
    Object.assign(rbObjSingletonClass(ivars), { sides: 0 });
    const array = Ary.of(1);
    Object.assign(rbObjSingletonClass(array).prototype, { area: () => 1 });
    for (const obj of [methods, ivars, array]) {
      expect(() => Marshal.dump(obj)).toThrow(new TypeError("singleton can't be dumped"));
    }
  });

  it("dumps an object with an empty singleton class as its class, and an extended one under TYPE_EXTENDED", () => {
    const shape = new Shape(":circle");
    rbObjSingletonClass(shape);
    expect(hex(Marshal.dump(shape))).toBe(fixtures["object nested path"]);

    const extended = new Shape(":circle");
    extend(extended, Kind);
    expect(hex(Marshal.dump(extended))).toBe(
      "0408653a0e47656f3a3a4b696e646f3a0f47656f3a3a5368617065063a0a406b696e643a0b636972636c65",
    );

    const anonymous = new Shape(":circle");
    extend(anonymous, new Module());
    expect(() => Marshal.dump(anonymous)).toThrow(TypeError);
    expect(() => Marshal.dump(anonymous)).toThrow(/^can't dump anonymous class #<Module:0x/);
  });

  it("dumps marshal_dump's value without the singleton check", () => {
    const obj = new Cache(1, new Map([["posts", [shared]]]));
    Object.assign(rbObjSingletonClass(obj).prototype, { area: () => 1 });
    expect(hex(Marshal.dump([obj, obj]))).toBe(fixtures["user marshal"]);
  });

  it("dumps an object of a class with a compat entry as its dumper's, under its own class", () => {
    expect(Marshal.dump(new Point(3))).toBe("\x04\bo:\nPoint\x06:\x07@vi\x08");
  });

  it("raises RuntimeError for a marshal_dump that returns an instance of the same class", () => {
    const obj = new Cache(1, null);
    obj.marshalDump = () => new Cache(2, null) as unknown as unknown[];
    expect(() => Marshal.dump(obj)).toThrow(
      new RuntimeError("Cache#marshal_dump returned same class instance"),
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

  it("raises for an instance of a class its path does not reach", () => {
    class Unreachable {}
    expect(() => Marshal.dump(new Unreachable())).toThrow(
      new ArgumentError("undefined class/module Unreachable"),
    );
    const other = class {};
    registerConstant("Unreachable", other);
    try {
      expect(() => Marshal.dump(new Unreachable())).toThrow(
        new TypeError("Unreachable can't be referred to"),
      );
    } finally {
      unregisterConstant("Unreachable", other);
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

describe("Marshal.load", () => {
  it.each(Object.keys(fixtures))("loads the bytes ruby dumped: %s", (name) => {
    const expected = name in LOADED ? LOADED[name] : VALUES[name];
    expect(Marshal.load(bytes(name))).toEqual(expected);
  });

  it("loads a Float boxed when it is whole, and -0.0 apart from 0.0", () => {
    const floats = Marshal.load(bytes("floats")) as unknown[];
    expect(floats[0]).toBeInstanceOf(Number);
    expect(Object.is((floats[6] as number).valueOf(), -0)).toBe(true);
  });

  it("loads a Hash default", () => {
    const h = Marshal.load(bytes("hash default")) as Hash<string, number>;
    expect(h.default()).toBe(5);
    expect((Marshal.load(bytes("hash default false")) as Hash<string, boolean>).default()).toBe(
      false,
    );
  });

  it("loads TYPE_UCLASS as the subclass, and a compare_by_identity Hash", () => {
    const ary = Marshal.load(bytes("array subclass"));
    expect(ary).toBeInstanceOf(Ary);
    const hsh = Marshal.load(bytes("hash subclass")) as Hsh;
    expect(hsh).toBeInstanceOf(Hsh);
    expect(hsh.get("a")).toBe(1);
    const ident = Marshal.load(bytes("hash compare_by_identity")) as Hash<number, number>;
    expect(ident.constructor).toBe(Hash);
    expect(ident.isCompareByIdentity()).toBe(true);
  });

  it("loads an Array that holds itself, and a linked object as the same object", () => {
    const loaded = Marshal.load(bytes("array cycle")) as unknown[];
    expect(loaded[0]).toBe(loaded);
    const [a, b] = Marshal.load(bytes("object link")) as [Column, Column];
    expect(b).toBe(a);
  });

  it("loads TYPE_USRMARSHAL through marshal_load without running the constructor, linked as one object", () => {
    const [a, b] = Marshal.load(bytes("user marshal")) as Cache[];
    expect(a).toBeInstanceOf(Cache);
    expect(b).toBe(a);
    expect(a.version).toBe(1);
  });

  it("raises TypeError for a TYPE_USRMARSHAL class with no marshal_load", () => {
    expect(() => Marshal.load("\x04\bU:\vColumn0")).toThrow(
      new TypeError("instance of Column needs to have method `marshal_load'"),
    );
  });

  it("loads a Rational through its compat class, linked as one frozen object", () => {
    const [a, b, c, d] = Marshal.load(bytes("rational")) as Rational[];
    expect(a).toBeInstanceOf(Rational);
    expect(b).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect([a.inspect(), c.inspect(), d.inspect()]).toEqual([
      "(1/2)",
      "(-3/4)",
      "(1180591620717411303424/3)",
    ]);
  });

  it("paths the compat class under Rational", () => {
    expect(rbModName(Rational.compatible)).toBe("Rational::compatible");
  });

  it("loads a Rational canonical and not reduced", () => {
    const load = (s: string) => (Marshal.load(s) as Rational).inspect();
    expect(load("\x04\bU:\rRational[\x07i\x06i\xfa")).toBe("(-1/1)");
    expect(load("\x04\bU:\rRational[\x07i\x09i\x0b")).toBe("(4/6)");
  });

  it("loads a TYPE_OBJECT of a class with a compat entry through its loader", () => {
    const r = Marshal.load(
      "\x04\bo:\rRational\x07:\x0f@numeratori\x06:\x11@denominatori\x07",
    ) as Rational;
    expect(r).toBeInstanceOf(Rational);
    expect(r.inspect()).toBe("(1/2)");
    const [point, link] = Marshal.load("\x04\b[\x07o:\nPoint\x06:\x07@vi\x08@\x06") as Point[];
    expect(point).toBeInstanceOf(Point);
    expect(point.x).toBe(3);
    expect(link).toBe(point);
  });

  it("raises for a marshalled Rational that is not a pair of Integers", () => {
    expect(() => Marshal.load("\x04\bU:\rRational[\x06i\x06")).toThrow(
      new ArgumentError("marshaled rational must have an array whose length is 2 but 1"),
    );
    expect(() => Marshal.load("\x04\bU:\rRational[\x07i\x06f\x061")).toThrow(
      new TypeError("not an integer"),
    );
    expect(() => Marshal.load("\x04\bU:\rRational[\x07U:\rRational[\x07i\x06i\x07i\x06")).toThrow(
      new TypeError("not an integer"),
    );
    expect(() => Marshal.load("\x04\bU:\rRational[\x07i\x06i\x00")).toThrow(
      new ZeroDivisionError("divided by 0"),
    );
    expect(() => Marshal.load("\x04\bU:\rRational0")).toThrow(
      new TypeError("wrong argument type nil (expected Array)"),
    );
  });

  it("raises TypeError defining a compat entry for a class with no allocator", () => {
    expect(() =>
      rbMarshalDefineCompat(
        Column,
        PointCompat,
        (c) => c,
        () => null,
      ),
    ).toThrow(new TypeError("no allocator"));
  });

  it("loads a Class and a Module as the constants their paths name", () => {
    const [column, shape, kind] = Marshal.load(bytes("class and module")) as unknown[];
    expect([column === Column, shape === Shape, kind === Kind]).toEqual([true, true, true]);
    expect(() => Marshal.load("\x04\bIc\x0bColumn\x06:\x08foo0")).toThrow(
      new TypeError("can't override instance variable of class `Column'"),
    );
  });

  it("leaves a linked String's entry alone under TYPE_IVAR, and reads the K ivar of a Hash only", () => {
    expect(() => Marshal.load('\x04\b[\x08"\x07\xc3\xa9I@\x06\x06:\x06ET@\x07')).toThrow(
      new ArgumentError("dump format error (unlinked)"),
    );
    expect(Marshal.load("\x04\bI{\x00\x06:\x06KT")).toEqual(new Hash());
    expect(() => Marshal.load("\x04\bI[\x00\x06:\x06KT")).toThrow(
      new ArgumentError("ruby2_keywords flag is given but [] is not a Hash"),
    );
    expect(() => Marshal.load('\x04\bI"\x00\x06:\x0dencodingi\x06')).toThrow(TypeError);
    expect(() => Marshal.load('\x04\bI"\x06a\x07:\x06ET:\x07@xi\x06')).toThrow(FrozenError);
  });

  it("loads what Marshal.dump dumped", () => {
    for (const [name, value] of Object.entries(VALUES)) {
      expect(Marshal.load(Marshal.dump(value))).toEqual(name in LOADED ? LOADED[name] : value);
    }
  });

  it("raises TypeError for an incompatible format version and for a source that is not a String", () => {
    expect(() => Marshal.load("\x04\x09i\x00")).toThrow(
      new TypeError(
        "incompatible marshal file format (can't be read)\n\tformat version 4.8 required; 4.9 given",
      ),
    );
    expect(() => Marshal.load("\x03\x00i\x00")).toThrow(TypeError);
    expect(Marshal.load("\x04\x07i\x06")).toBe(1);
    expect(() => Marshal.load(1)).toThrow(new TypeError("instance of IO needed"));
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
    expect(() => Marshal.load('\x04\bo"\x00\x00')).toThrow(
      new ArgumentError("dump format error for symbol(0x22)"),
    );
    expect(() => Marshal.load("\x04\bI;\x00")).toThrow(new ArgumentError("bad symbol"));
    expect(() => Marshal.load("\x04\bo:\x09Hash\x00")).toThrow(
      new ArgumentError("dump format error"),
    );
  });

  it("raises ArgumentError for a path that does not resolve to a class or a module", () => {
    expect(() => Marshal.load("\x04\bo:\x0dFoo::Bar\x00")).toThrow(
      new ArgumentError("undefined class/module Foo::"),
    );
    expect(() => Marshal.load("\x04\bo:\x08Geo\x00")).toThrow(
      new ArgumentError("Geo does not refer to class"),
    );
    expect(() => Marshal.load("\x04\bc\x0eGeo::Kind")).toThrow(
      new ArgumentError("Geo::Kind does not refer to class"),
    );
    expect(() => Marshal.load("\x04\bm\x0bColumn")).toThrow(
      new ArgumentError("Column does not refer to module"),
    );
  });

  it("raises ArgumentError for a TYPE_UCLASS over a value of another type", () => {
    for (const data of ["\x04\bC:\x08Ary{\x00", "\x04\bC:\x08Aryi\x06", "\x04\bC:\x08Aryf\x061"]) {
      expect(() => Marshal.load(data)).toThrow(new ArgumentError("dump format error (user class)"));
    }
  });
});
