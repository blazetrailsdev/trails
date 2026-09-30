import { describe, it, expect } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import { Coder, dump, loadTags, toYaml, unsafeLoad } from "./yaml.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { registerConstant, unregisterConstant } from "./inflector.js";

class Point {
  x = 1;
  y = 2;
}

class Tagged {
  seen: Record<string, unknown> | null = null;

  initWith(coder: Coder): void {
    this.seen = { ...coder };
  }

  encodeWith(coder: Coder): void {
    coder["tag"] = "kept";
    coder["name"] = "tagged";
  }
}

describe("Psych object protocol", () => {
  it("dumps an object's fields under its !ruby/object tag and revives it", () => {
    registerConstant("Point", Point);
    try {
      const yaml = dump(new Point());
      expect(yaml).toContain("!ruby/object:Point");
      const loaded = unsafeLoad(yaml) as Point;
      expect(loaded).toBeInstanceOf(Point);
      expect([loaded.x, loaded.y]).toEqual([1, 2]);
    } finally {
      unregisterConstant("Point", Point);
    }
  });

  it("round-trips encode_with / init_with, keeping a coder key named tag", () => {
    registerConstant("Tagged", Tagged);
    try {
      const loaded = unsafeLoad(dump(new Tagged())) as Tagged;
      expect(loaded.seen).toEqual({ tag: "kept", name: "tagged" });
    } finally {
      unregisterConstant("Tagged", Tagged);
    }
  });

  it("aliases a repeated object and revives one shared instance", () => {
    const shared = { a: 1 };
    const loaded = unsafeLoad(dump([shared, shared])) as unknown[];
    expect(loaded[0]).toBe(loaded[1]);
  });

  it("revives a class through !ruby/class", () => {
    expect(unsafeLoad(dump(Range))).toBe(Range);
  });

  it("round-trips a Range through !ruby/range", () => {
    const loaded = unsafeLoad(dump(new Range(1, 5, true))) as Range<number>;
    expect([loaded.begin, loaded.end, loaded.excludeEnd]).toEqual([1, 5, true]);
    const scalar = unsafeLoad("--- !ruby/range 1..3") as Range<number>;
    expect([scalar.begin, scalar.end, scalar.excludeEnd]).toEqual([1, 3, false]);
  });

  it("round-trips a Regexp through !ruby/regexp", () => {
    const loaded = unsafeLoad(dump(/a.b/i)) as RegExp;
    expect([loaded.source, loaded.flags]).toEqual(["a.b", "i"]);
  });

  it("loads a !ruby/symbol scalar as a colon-prefixed string", () => {
    expect(unsafeLoad("--- !ruby/symbol short")).toBe(":short");
  });

  it("dumps a Time with format_time and loads it back as a Time", () => {
    const time = Time.utc(2003, 7, 16, 14, 28, 11);
    const yaml = dump(time);
    expect(yaml).toContain("2003-07-16 14:28:11.000000000 Z");
    const loaded = unsafeLoad(yaml);
    expect(loaded).toBeInstanceOf(Time);
    expect((loaded as Time).toS()).toBe(time.toS());
  });

  it("dumps a Temporal.Instant as a UTC Time and loads it back as UTC", () => {
    const loaded = unsafeLoad(dump(Temporal.Instant.from("2003-07-16T14:28:11Z"))) as Time;
    expect(loaded).toBeInstanceOf(Time);
    expect(loaded.isUtc()).toBe(true);
  });

  it("keeps Strings that look like other scalars Strings", () => {
    const strings = ["123", "true", "null", "1.5", "2004-04-15", ":sym", "a\nb"];
    expect(unsafeLoad(dump(strings))).toEqual(strings);
  });

  it("dumps a Temporal.ZonedDateTime with its offset", () => {
    const zoned = Temporal.ZonedDateTime.from("2003-07-16T14:28:11-07:00[America/Los_Angeles]");
    expect(dump(zoned)).toContain("2003-07-16 14:28:11.000000000 -07:00");
  });

  it("dumps a Date as its ISO scalar and loads it back as a date", () => {
    const yaml = dump(RubyDate.civil(2004, 4, 15));
    expect(yaml).toContain("2004-04-15");
    expect(String(unsafeLoad(yaml))).toBe("2004-04-15");
    expect(unsafeLoad(yaml)).toBeInstanceOf(Temporal.PlainDate);
  });

  it("keeps a quoted timestamp a String", () => {
    expect(unsafeLoad("--- '2004-04-15'")).toBe("2004-04-15");
  });

  it("merges << keys, the first sequence entry winning", () => {
    const loaded = unsafeLoad(
      "a: &a {x: 1, y: 1}\nb: &b {x: 2, z: 2}\nc:\n  <<: [*a, *b]\n  w: 0\n",
    ) as Record<string, Record<string, number>>;
    expect({ ...loaded["c"] }).toEqual({ x: 1, y: 1, z: 2, w: 0 });
  });

  it("keeps a __proto__ key as an own key", () => {
    const loaded = unsafeLoad("__proto__: 1\n") as Record<string, unknown>;
    expect(Object.getPrototypeOf(loaded)).toBeNull();
    expect(Object.hasOwn(loaded, "__proto__")).toBe(true);
  });

  it("resolves a legacy tag through load_tags", () => {
    registerConstant("Point", Point);
    loadTags["!ruby/object:Legacy::Point"] = "Point";
    try {
      expect(unsafeLoad("--- !ruby/object:Legacy::Point\nx: 3\n")).toBeInstanceOf(Point);
    } finally {
      delete loadTags["!ruby/object:Legacy::Point"];
      unregisterConstant("Point", Point);
    }
  });

  it("dumps a Hash subclass's ivars under !ruby/hash-with-ivars, keyed by Symbol", () => {
    const h = new (class Carrier extends HashWithIndifferentAccess {
      foo = "bar";
    })();
    h.set("x", 42);
    expect(toYaml(h)).toBe(
      "---\n!ruby/hash-with-ivars:Carrier\nivars:\n  :@foo: bar\nelements:\n  x: 42\n",
    );
  });

  it("tags a Hash subclass without ivars as !ruby/hash", () => {
    const h = new (class Plain extends HashWithIndifferentAccess {})();
    h.set("x", 42);
    expect(toYaml(h)).toBe("---\n!ruby/hash:Plain\nx: 42\n");
  });
});
