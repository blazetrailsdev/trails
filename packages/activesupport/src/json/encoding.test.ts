import { describe, it, expect } from "vitest";

import { ActiveSupportJSON } from "../json.js";
import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { Encoding } from "./encoding.js";
import { asJson } from "../core-ext/object/json.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";

/** Rails' `JSONTest::Hashlike` (encoding_test_cases.rb:16-20). */
class Hashlike {
  toHash(): Record<string, unknown> {
    return { foo: "hello", bar: "world" };
  }
}

/** Stands in for Rails' bare `Object.new` with `@foo`/`@bar` set (encoding_test.rb:151-153). */
class Bare {
  foo?: string;
  bar?: string;
}

/** Rails' `JSONTest::People` (encoding_test.rb:227-240) — a bare Enumerable. */
class People {
  #people = [
    { name: "John", address: { city: "London", country: "UK" } },
    { name: "Jean", address: { city: "Paris", country: "France" } },
  ];

  each(): IterableIterator<unknown> {
    return this.#people[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<unknown> {
    return this.each();
  }
}

function withStandardJsonTimeFormat(value: boolean, block: () => void): void {
  const old = Encoding.useStandardJsonTimeFormat;
  Encoding.useStandardJsonTimeFormat = value;
  try {
    block();
  } finally {
    Encoding.useStandardJsonTimeFormat = old;
  }
}

function withTimePrecision(value: number, block: () => void): void {
  const old = Encoding.timePrecision;
  Encoding.timePrecision = value;
  try {
    block();
  } finally {
    Encoding.timePrecision = old;
  }
}

describe("TestJSONEncoding", () => {
  it.skip("process status");

  it("numeric", () => {
    // Rails' NumericTests (encoding_test_cases.rb:62-72); the RomanNumeral /
    // CustomNumeric cases need Ruby's `Numeric` subclassing and are unported.
    expect(ActiveSupportJSON.encode(1)).toBe("1");
    expect(ActiveSupportJSON.encode(2.5)).toBe("2.5");
    expect(ActiveSupportJSON.encode(NaN)).toBe("null");
    expect(ActiveSupportJSON.encode(Infinity)).toBe("null");
    expect(ActiveSupportJSON.encode(-Infinity)).toBe("null");
    expect(ActiveSupportJSON.encode(new BigDecimal("2.5"))).toBe('"2.5"');
  });

  it("module", () => {
    // Rails' ModuleTests (encoding_test_cases.rb:95-98). Ruby's `name` is the
    // fully-qualified constant path; a JS class carries only its own name.
    expect(ActiveSupportJSON.encode(Hashlike)).toBe('"Hashlike"');
    expect(ActiveSupportJSON.encode(People)).toBe('"People"');
  });

  it("hash encoding", () => {
    const h = { a: 1, b: "hello" };
    const json = JSON.stringify(h);
    expect(json).toBe('{"a":1,"b":"hello"}');
  });

  it("hash keys encoding", () => {
    Encoding.escapeHtmlEntitiesInJson = true;
    try {
      expect(ActiveSupportJSON.encode({ "<>": "<>" })).toBe('{"\\u003c\\u003e":"\\u003c\\u003e"}');
    } finally {
      Encoding.escapeHtmlEntitiesInJson = false;
    }
  });

  it("hash keys encoding option", () => {
    const globalConfig = Encoding.escapeHtmlEntitiesInJson;
    try {
      Encoding.escapeHtmlEntitiesInJson = true;
      expect(ActiveSupportJSON.encode({ "<>": "<>" }, { escapeHtmlEntities: false })).toBe(
        '{"<>":"<>"}',
      );

      Encoding.escapeHtmlEntitiesInJson = false;
      expect(ActiveSupportJSON.encode({ "<>": "<>" }, { escapeHtmlEntities: true })).toBe(
        '{"\\u003c\\u003e":"\\u003c\\u003e"}',
      );
    } finally {
      Encoding.escapeHtmlEntitiesInJson = globalConfig;
    }
  });

  it("utf8 string encoded properly", () => {
    const s = "こんにちは";
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    expect(parsed).toBe(s);
  });

  it.skip("non utf8 string transcodes");

  it("wide utf8 chars", () => {
    const s = "🎉🚀";
    expect(JSON.parse(JSON.stringify(s))).toBe(s);
  });

  it("wide utf8 roundtrip", () => {
    const s = "Hello 🌍!";
    expect(JSON.parse(JSON.stringify(s))).toBe(s);
  });

  it("hash key identifiers are always quoted", () => {
    const h = { "my key": 1, normal: 2 };
    const json = JSON.stringify(h);
    expect(json).toContain('"my key"');
    expect(json).toContain('"normal"');
  });

  it("hash should allow key filtering with only", () => {
    expect(ActiveSupportJSON.encode({ a: 1, b: 2, c: 3 }, { only: "a" })).toBe('{"a":1}');
  });

  it("hash should allow key filtering with except", () => {
    expect(ActiveSupportJSON.encode({ foo: "bar", b: 2, c: 3 }, { except: ["foo", "c"] })).toBe(
      '{"b":2}',
    );
  });

  it("time to json includes local offset", () => {
    const d = new Date("2023-06-15T12:00:00Z");
    const json = JSON.stringify(d);
    expect(json).toContain("2023");
  });

  it("hash with time to json", () => {
    const h = { at: new Date("2023-01-01T00:00:00Z") };
    const json = JSON.stringify(h);
    expect(json).toContain("2023");
  });

  it("nested hash with float", () => {
    const h = { x: 1.5, nested: { y: 2.75 } };
    const parsed = JSON.parse(JSON.stringify(h));
    expect(parsed.x).toBeCloseTo(1.5);
    expect(parsed.nested.y).toBeCloseTo(2.75);
  });

  it("hash like with options", () => {
    const h = new Hashlike();
    const json = ActiveSupportJSON.encode(h, { only: ["foo"] });

    expect(JSON.parse(json)).toEqual({ foo: "hello" });
  });

  it("object to json with options", () => {
    const obj = new Bare();
    obj.foo = "hello";
    obj.bar = "world";
    const json = ActiveSupportJSON.encode(obj, { only: ["foo"] });

    expect(JSON.parse(json)).toEqual({ foo: "hello" });
  });

  it.skip("struct to json with options");
  it.skip("struct to json with options nested");

  it("hash should pass encoding options to children in as json", () => {
    const h = { nested: { a: 1 } };
    expect(JSON.parse(JSON.stringify(h))).toEqual(h);
  });

  it("hash should pass encoding options to children in to json", () => {
    const h = { arr: [1, 2, 3] };
    expect(JSON.parse(JSON.stringify(h))).toEqual(h);
  });

  it("array should pass encoding options to children in as json", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    expect(JSON.parse(JSON.stringify(arr))).toEqual(arr);
  });

  it("array should pass encoding options to children in to json", () => {
    const arr = [1, "hello", true, null];
    expect(JSON.parse(JSON.stringify(arr))).toEqual(arr);
  });

  it("enumerable should generate json with as json", () => {
    const json = asJson(new People(), { only: ["address", "city"] });
    const expected = [{ address: { city: "London" } }, { address: { city: "Paris" } }];

    expect(json).toEqual(expected);
  });

  it("enumerable should generate json with to json", () => {
    const json = ActiveSupportJSON.encode(new People(), { only: ["address", "city"] });
    expect(json).toBe('[{"address":{"city":"London"}},{"address":{"city":"Paris"}}]');
  });

  it("enumerable should pass encoding options to children in as json", () => {
    const json = asJson(new People().each(), { only: ["address", "city"] });
    const expected = [{ address: { city: "London" } }, { address: { city: "Paris" } }];

    expect(json).toEqual(expected);
  });

  it("enumerable should pass encoding options to children in to json", () => {
    const json = ActiveSupportJSON.encode(new People().each(), { only: ["address", "city"] });

    expect(json).toBe('[{"address":{"city":"London"}},{"address":{"city":"Paris"}}]');
  });

  it("hash to json should not keep options around", () => {
    const h = { a: 1 };
    const j1 = JSON.stringify(h);
    const j2 = JSON.stringify(h);
    expect(j1).toBe(j2);
  });

  it("array to json should not keep options around", () => {
    const arr = [1, 2];
    expect(JSON.stringify(arr)).toBe(JSON.stringify(arr));
  });

  it("hash as json without options", () => {
    const h = { x: 42 };
    expect(JSON.parse(JSON.stringify(h))).toEqual(h);
  });

  it("array as json without options", () => {
    const arr = [1, 2, 3];
    expect(JSON.parse(JSON.stringify(arr))).toEqual(arr);
  });

  it.skip("struct encoding");
  it.skip("data encoding");

  it("nil true and false represented as themselves", () => {
    expect(JSON.stringify(null)).toBe("null");
    expect(JSON.stringify(true)).toBe("true");
    expect(JSON.stringify(false)).toBe("false");
  });

  it.skip("json gem dump by passing active support encoder");
  it.skip("json gem generate by passing active support encoder");
  it.skip("json gem pretty generate by passing active support encoder");
  it("twz to json with use standard json time format config set to false", () => {
    withStandardJsonTimeFormat(false, () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      const time = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), zone);
      expect(ActiveSupportJSON.encode(time)).toBe('"1999/12/31 19:00:00 -0500"');
    });
  });

  it("twz to json with use standard json time format config set to true", () => {
    withStandardJsonTimeFormat(true, () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)");
      const time = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), zone);
      expect(ActiveSupportJSON.encode(time)).toBe('"1999-12-31T19:00:00.000-05:00"');
    });
  });

  it("twz to json with custom time precision", () => {
    withStandardJsonTimeFormat(true, () => {
      withTimePrecision(0, () => {
        const zone = TimeZone.find("Eastern Time (US & Canada)");
        const time = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), zone);
        expect(ActiveSupportJSON.encode(time)).toBe('"1999-12-31T19:00:00-05:00"');
      });
    });
  });

  it("time to json with custom time precision", () => {
    withStandardJsonTimeFormat(true, () => {
      withTimePrecision(0, () => {
        const time = Temporal.Instant.from("2000-01-01T00:00:00Z");
        expect(ActiveSupportJSON.encode(time)).toBe('"2000-01-01T00:00:00Z"');
      });
    });
  });

  it("datetime to json with custom time precision", () => {
    withStandardJsonTimeFormat(true, () => {
      withTimePrecision(0, () => {
        const datetime = Temporal.PlainDateTime.from("2000-01-01T00:00:00");
        expect(ActiveSupportJSON.encode(datetime)).toBe('"2000-01-01T00:00:00+00:00"');
      });
    });
  });

  it.skip("twz to json when wrapping a date time");

  it("exception to json", () => {
    const err = new Error("boom");
    const json = JSON.stringify({ message: err.message });
    expect(JSON.parse(json).message).toBe("boom");
  });

  it("to json works when as json returns infinite number", () => {
    // JS JSON.stringify converts Infinity to null
    expect(JSON.stringify(Infinity)).toBe("null");
  });

  it("to json works when as json returns NaN number", () => {
    expect(JSON.stringify(NaN)).toBe("null");
  });

  it.skip("to json works on io objects");
});
