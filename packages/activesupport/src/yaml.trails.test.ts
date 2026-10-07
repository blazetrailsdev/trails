import { describe, it, expect } from "vitest";
import { Range, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime, Temporal, Time } from "@blazetrails/date";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

class Point {
  x = 1;
  y = 2;
}

class Tagged {
  seen: Record<string, unknown> | null = null;

  initWith(coder: Psych.Coder): void {
    this.seen = { ...coder };
  }

  encodeWith(coder: Psych.Coder): void {
    coder["tag"] = "kept";
    coder["name"] = "tagged";
  }
}

describe("Psych object protocol", () => {
  it("dumps an object's fields under its !ruby/object tag and revives it", () => {
    registerConstant("Point", Point);
    try {
      const yaml = Psych.dump(new Point());
      expect(yaml).toContain("!ruby/object:Point");
      const loaded = Psych.unsafeLoad(yaml) as Point;
      expect(loaded).toBeInstanceOf(Point);
      expect([loaded.x, loaded.y]).toEqual([1, 2]);
    } finally {
      unregisterConstant("Point", Point);
    }
  });

  it("round-trips encode_with / init_with, keeping a coder key named tag", () => {
    registerConstant("Tagged", Tagged);
    try {
      const loaded = Psych.unsafeLoad(Psych.dump(new Tagged())) as Tagged;
      expect(loaded.seen).toEqual({ tag: "kept", name: "tagged" });
    } finally {
      unregisterConstant("Tagged", Tagged);
    }
  });

  it("aliases a repeated object and revives one shared instance", () => {
    const shared = { a: 1 };
    const loaded = Psych.unsafeLoad(Psych.dump([shared, shared])) as unknown[];
    expect(loaded[0]).toBe(loaded[1]);
  });

  it("revives a class through !ruby/class", () => {
    expect(Psych.unsafeLoad(Psych.dump(Range))).toBe(Range);
  });

  it("round-trips a Range through !ruby/range", () => {
    const loaded = Psych.unsafeLoad(Psych.dump(new Range(1, 5, true))) as Range<number>;
    expect([loaded.begin, loaded.end, loaded.excludeEnd]).toEqual([1, 5, true]);
    const scalar = Psych.unsafeLoad("--- !ruby/range 1..3") as Range<number>;
    expect([scalar.begin, scalar.end, scalar.excludeEnd]).toEqual([1, 3, false]);
  });

  it("round-trips a Regexp through !ruby/regexp", () => {
    const loaded = Psych.unsafeLoad(Psych.dump(/a.b/i)) as RegExp;
    expect([loaded.source, loaded.flags]).toEqual(["a.b", "i"]);
  });

  it("loads a !ruby/symbol scalar as a colon-prefixed string", () => {
    expect(Psych.unsafeLoad("--- !ruby/symbol short")).toBe(":short");
  });

  it("dumps a Time with format_time and loads it back as a Time", () => {
    const time = Time.utc(2003, 7, 16, 14, 28, 11);
    const yaml = Psych.dump(time);
    expect(yaml).toContain("2003-07-16 14:28:11.000000000 Z");
    const loaded = Psych.unsafeLoad(yaml);
    expect(loaded).toBeInstanceOf(Time);
    expect((loaded as Time).toS()).toBe(time.toS());
  });

  it("dumps a Temporal.Instant as a UTC Time and loads it back as UTC", () => {
    const loaded = Psych.unsafeLoad(
      Psych.dump(Temporal.Instant.from("2003-07-16T14:28:11Z")),
    ) as Time;
    expect(loaded).toBeInstanceOf(Time);
    expect(loaded.isUtc()).toBe(true);
  });

  it("keeps Strings that look like other scalars Strings", () => {
    const strings = ["123", "true", "null", "1.5", "2004-04-15", ":sym", "a\nb"];
    expect(Psych.unsafeLoad(Psych.dump(strings))).toEqual(strings);
  });

  it("dumps a Temporal.ZonedDateTime with its offset", () => {
    const zoned = Temporal.ZonedDateTime.from("2003-07-16T14:28:11-07:00[America/Los_Angeles]");
    expect(Psych.dump(zoned)).toContain("2003-07-16 14:28:11.000000000 -07:00");
  });

  it("dumps a Date as its ISO scalar and loads it back as a date", () => {
    const yaml = Psych.dump(RubyDate.civil(2004, 4, 15));
    expect(yaml).toContain("2004-04-15");
    expect(String(Psych.unsafeLoad(yaml))).toBe("2004-04-15");
    expect(Psych.unsafeLoad(yaml)).toBeInstanceOf(Temporal.PlainDate);
  });

  it("dumps a DateTime under !ruby/object:DateTime, not as a Date", () => {
    const yaml = Psych.dump(new DateTime(2024, 1, 2, 3, 4, 5));
    expect(yaml).toContain("!ruby/object:DateTime 2024-01-02 03:04:05.000000000 Z");
  });

  it("keeps a quoted timestamp a String", () => {
    expect(Psych.unsafeLoad("--- '2004-04-15'")).toBe("2004-04-15");
  });

  it("merges << keys, the first sequence entry winning", () => {
    const loaded = Psych.unsafeLoad(
      "a: &a {x: 1, y: 1}\nb: &b {x: 2, z: 2}\nc:\n  <<: [*a, *b]\n  w: 0\n",
    ) as Record<string, Record<string, number>>;
    expect({ ...loaded["c"] }).toEqual({ x: 1, y: 1, z: 2, w: 0 });
  });

  it("keeps a __proto__ key as an own key", () => {
    const loaded = Psych.unsafeLoad("__proto__: 1\n") as Record<string, unknown>;
    expect(Object.getPrototypeOf(loaded)).toBeNull();
    expect(Object.hasOwn(loaded, "__proto__")).toBe(true);
  });

  it("resolves a legacy tag through load_tags", () => {
    registerConstant("Point", Point);
    Psych.loadTags["!ruby/object:Legacy::Point"] = "Point";
    try {
      expect(Psych.unsafeLoad("--- !ruby/object:Legacy::Point\nx: 3\n")).toBeInstanceOf(Point);
    } finally {
      delete Psych.loadTags["!ruby/object:Legacy::Point"];
      unregisterConstant("Point", Point);
    }
  });

  it("dumps a Hash subclass's ivars under !ruby/hash-with-ivars, keyed by Symbol", () => {
    const h = new (class Carrier extends HashWithIndifferentAccess {
      foo = "bar";
    })();
    h.set("x", 42);
    expect(Psych.dump(h)).toBe(
      "---\n!ruby/hash-with-ivars:Carrier\nivars:\n  :@foo: bar\nelements:\n  x: 42\n",
    );
  });

  it("revives a !ruby/hash class as that Hash, merge keys included", () => {
    const h = Psych.unsafeLoad(
      "--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\n<<: { y: 1 }\nx: 42\n",
    ) as HashWithIndifferentAccess;
    expect(h).toBeInstanceOf(HashWithIndifferentAccess);
    expect([...h]).toEqual([
      ["y", 1],
      ["x", 42],
    ]);
  });

  it("tags a Hash subclass without ivars as !ruby/hash", () => {
    const h = new (class Plain extends HashWithIndifferentAccess {})();
    h.set("x", 42);
    expect(Psych.dump(h)).toBe("---\n!ruby/hash:Plain\nx: 42\n");
  });
});
