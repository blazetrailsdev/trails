import { describe, it, expect } from "vitest";

import { ActiveSupportJSON } from "../../lib/json.js";
import { DateTime, Time } from "@blazetrails/date";
import { TimeWithZone } from "../../lib/time-with-zone.js";
import { TimeZone } from "../../lib/values/time-zone.js";
import { Encoding, type EncodeOptions } from "../../lib/json/encoding.js";
import { asJson, Hash, ToJsonWithActiveSupportEncoder } from "../../lib/core-ext/object/json.js";
import { BigDecimal } from "../../lib/core-ext/big-decimal/conversions.js";
import { Range } from "@blazetrails/ruby-compat/range";
import { Hash as RubyHash, JSON as RubyJSON, Struct } from "@blazetrails/ruby-compat";
import { Date as RubyDate } from "@blazetrails/date";
import { assertNil } from "../../lib/testing/assertions.js";
import { withEnvTz } from "../../lib/time-zone-test-helpers.js";

class HashWithAsJson extends RubyHash<string, unknown> {
  asJsonCalled: boolean | null = null;

  asJson(options: EncodeOptions | null = {}): unknown {
    this.asJsonCalled = true;
    return Hash.asJson(this, options);
  }
}

class Hashlike {
  toHash(): Record<string, unknown> {
    return { foo: "hello", bar: "world" };
  }
}

class Bare {
  foo?: string;
  bar?: string;
}

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

class InfiniteNumber {
  asJson(_options?: EncodeOptions | null): unknown {
    return { number: Infinity };
  }

  toJSON = ToJsonWithActiveSupportEncoder.toJSON;
}

class NaNNumber {
  asJson(_options?: EncodeOptions | null): unknown {
    return { number: NaN };
  }

  toJSON = ToJsonWithActiveSupportEncoder.toJSON;
}

function sortedJson(json: string): string {
  if (json.startsWith("{") && json.endsWith("}")) {
    return "{" + json.slice(1, -1).split(",").sort().join(",") + "}";
  } else {
    return json;
  }
}

function objectKeys(jsonObject: string): string[] {
  return [...jsonObject.slice(1, -1).matchAll(/([^{}:,\s]+):/g)].map((match) => match[1]).sort();
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
  it("numeric", () => {
    expect(ActiveSupportJSON.encode(1)).toBe("1");
    expect(ActiveSupportJSON.encode(2.5)).toBe("2.5");
    expect(ActiveSupportJSON.encode(NaN)).toBe("null");
    expect(ActiveSupportJSON.encode(Infinity)).toBe("null");
    expect(ActiveSupportJSON.encode(-Infinity)).toBe("null");
    expect(ActiveSupportJSON.encode(new BigDecimal("2.5"))).toBe('"2.5"');
  });

  it("module", () => {
    expect(ActiveSupportJSON.encode(Hashlike)).toBe('"Hashlike"');
    expect(ActiveSupportJSON.encode(People)).toBe('"People"');
  });

  it("range", () => {
    expect(ActiveSupportJSON.encode(new Range(1, 2))).toBe('"1..2"');
    expect(ActiveSupportJSON.encode(new Range(1, 2, true))).toBe('"1...2"');
    expect(ActiveSupportJSON.encode(new Range(1.5, 2.5))).toBe('"1.5..2.5"');
  });

  it("uri", () => {
    expect(ActiveSupportJSON.encode(new URL("http://example.com"))).toBe('"http://example.com/"');
  });

  it("hash encoding", () => {
    expect(ActiveSupportJSON.encode({ a: "b" })).toBe('{"a":"b"}');
    expect(ActiveSupportJSON.encode({ a: 1 })).toBe('{"a":1}');
    expect(ActiveSupportJSON.encode({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(ActiveSupportJSON.encode({ 1: 2 })).toBe('{"1":2}');

    expect(sortedJson(ActiveSupportJSON.encode({ a: "b", c: "d" }))).toBe('{"a":"b","c":"d"}');
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
    let result = ActiveSupportJSON.encode("€2.99");
    expect(result).toBe('"€2.99"');

    result = ActiveSupportJSON.encode("✎☺");
    expect(result).toBe('"✎☺"');
  });

  it("wide utf8 chars", () => {
    const s = "🎉🚀";
    expect(JSON.parse(JSON.stringify(s))).toBe(s);
  });

  it("wide utf8 roundtrip", () => {
    const s = "Hello 🌍!";
    expect(JSON.parse(JSON.stringify(s))).toBe(s);
  });

  it("hash key identifiers are always quoted", () => {
    const values = { 0: 0, 1: 1, _: "_", $: "$", a: "a", A: "A", A0: "A0", A0B: "A0B" };
    expect(objectKeys(ActiveSupportJSON.encode(values))).toEqual(
      ['"$"', '"A"', '"A0"', '"A0B"', '"_"', '"a"', '"0"', '"1"'].sort(),
    );
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
    withStandardJsonTimeFormat(true, () => {
      withEnvTz("US/Eastern", () => {
        expect(ActiveSupportJSON.encode(Time.local(2005, 2, 1, 15, 15, 10))).toBe(
          '"2005-02-01T15:15:10.000-05:00"',
        );
      });
    });
  });

  it("hash with time to json", () => {
    withStandardJsonTimeFormat(false, () => {
      expect(
        ActiveSupportJSON.encode({ time: Temporal.Instant.from("2009-01-01T00:00:00Z") }),
      ).toBe('{"time":"2009/01/01 00:00:00 +0000"}');
    });
  });

  it("nested hash with float", () => {
    expect(() => {
      const hash = {
        CHI: {
          display_name: "chicago",
          latitude: 123.234,
        },
      };
      ActiveSupportJSON.encode(hash);
    }).not.toThrow();
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

  it("nil true and false represented as themselves", () => {
    assertNil(asJson(null));
    expect(asJson(true)).toBe(true);
    expect(asJson(false)).toBe(false);
  });

  it("twz to json with use standard json time format config set to false", () => {
    withStandardJsonTimeFormat(false, () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const time = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), zone);
      expect(ActiveSupportJSON.encode(time)).toBe('"1999/12/31 19:00:00 -0500"');
    });
  });

  it("twz to json with use standard json time format config set to true", () => {
    withStandardJsonTimeFormat(true, () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const time = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), zone);
      expect(ActiveSupportJSON.encode(time)).toBe('"1999-12-31T19:00:00.000-05:00"');
    });
  });

  it("twz to json with custom time precision", () => {
    withStandardJsonTimeFormat(true, () => {
      withTimePrecision(0, () => {
        const zone = TimeZone.find("Eastern Time (US & Canada)")!;
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

  it("twz to json when wrapping a date time", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const time = new TimeWithZone(DateTime.civil(2000), zone);
    expect(ActiveSupportJSON.encode(time)).toBe('"1999-12-31T19:00:00.000-05:00"');
  });

  it("exception to json", () => {
    const exception = new Error("foo");
    expect(ActiveSupportJSON.encode(exception)).toBe('"foo"');
  });

  it("to json works when as json returns infinite number", () => {
    expect(new InfiniteNumber().toJSON()).toBe('{"number":null}');
  });

  it("to json works when as json returns NaN number", () => {
    expect(new NaNNumber().toJSON()).toBe('{"number":null}');
  });

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" — `$?` is a `Process::Status` of a spawned child.
  it.skip("process status", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("non utf8 string transcodes", () => {});

  it("struct to json with options", () => {
    const struct = new (Struct.new("foo", "bar"))() as unknown as { foo: unknown; bar: unknown };
    struct.foo = "hello";
    struct.bar = "world";
    const json = ActiveSupportJSON.encode(struct, { only: ["foo"] });

    expect(JSON.parse(json)).toEqual({ foo: "hello" });
  });

  it("struct to json with options nested", () => {
    const klass = Struct.new("foo", "bar");
    const struct = new klass("hello", "world");
    const parentStruct = new klass(struct, "world");
    const json = ActiveSupportJSON.encode(parentStruct, { only: ["foo"] });

    expect(JSON.parse(json)).toEqual({ foo: { foo: "hello" } });
  });

  it("struct encoding", () => {
    const UserNameAndEmail = Struct.new("name", "email");
    const UserNameAndDate = Struct.new("name", "date");
    const Custom = Struct.new("name", "sub");
    const userEmail = new UserNameAndEmail("David", "sample@example.com");
    const userBirthday = new UserNameAndDate("David", new RubyDate(2010, 1, 1));
    const custom = new Custom("David", userBirthday);

    let jsonStrings = "";
    let jsonStringAndDate = "";
    let jsonCustom = "";

    expect(() => {
      jsonStrings = ActiveSupportJSON.encode(userEmail);
      jsonStringAndDate = ActiveSupportJSON.encode(userBirthday);
      jsonCustom = ActiveSupportJSON.encode(custom);
    }).not.toThrow();

    expect(ActiveSupportJSON.decode(jsonCustom)).toEqual({
      name: "David",
      sub: { name: "David", date: "2010-01-01" },
    });
    expect(ActiveSupportJSON.decode(jsonStrings)).toEqual({
      name: "David",
      email: "sample@example.com",
    });
    expect(ActiveSupportJSON.decode(jsonStringAndDate)).toEqual({
      name: "David",
      date: "2010-01-01",
    });
  });

  it.skip("data encoding", () => {});

  it("json gem dump by passing active support encoder", () => {
    const h = new HashWithAsJson();
    h.set(":foo", "hello");
    h.set(":bar", "world");

    expect(RubyJSON.dump(h)).toBe(`{"foo":"hello","bar":"world"}`);
    assertNil(h.asJsonCalled);
  });

  it("json gem generate by passing active support encoder", () => {
    const h = new HashWithAsJson();
    h.set(":foo", "hello");
    h.set(":bar", "world");

    expect(RubyJSON.generate(h)).toBe(`{"foo":"hello","bar":"world"}`);
    assertNil(h.asJsonCalled);
  });

  it("json gem pretty generate by passing active support encoder", () => {
    const h = new HashWithAsJson();
    h.set(":foo", "hello");
    h.set(":bar", "world");

    expect(RubyJSON.prettyGenerate(h)).toBe(`{
  "foo": "hello",
  "bar": "world"
}`);
    assertNil(h.asJsonCalled);
  });

  it.skip("to json works on io objects", () => {});
});
