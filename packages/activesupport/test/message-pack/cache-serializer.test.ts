import { describe, it, expect, beforeAll } from "vitest";
import { MessagePack, UnserializableObjectError } from "../../lib/message-pack.js";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { env as ENV, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { DateTime, Time } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/ruby-compat/big-decimal";
import { Complex, complex } from "@blazetrails/ruby-compat/complex";
import { IPAddr } from "@blazetrails/ruby-compat/ipaddr";
import { Marshal } from "@blazetrails/ruby-compat/marshal";
import { rbCDate, rbCDateTime, rbCInteger, rbCSymbol } from "@blazetrails/ruby-compat/object";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { Range } from "@blazetrails/ruby-compat/range";
import { Rational, rational } from "@blazetrails/ruby-compat/rational";
import { URI } from "@blazetrails/ruby-compat/uri/common";
import { Generic } from "@blazetrails/ruby-compat/uri/generic";
import {
  Duration,
  days,
  hours,
  minutes,
  months,
  seconds,
  weeks,
  years,
} from "../../lib/duration.js";
import { TimeWithZone } from "../../lib/time-with-zone.js";
import { TimeZone } from "../../lib/values/time-zone.js";
import { HashWithIndifferentAccess } from "../../lib/hash-with-indifferent-access.js";

import { assertNotNil } from "../../lib/testing/assertions.js";

class HasValue {
  constructor(readonly value: string) {}
}

class DefinesJsonCreate extends HasValue {
  static jsonCreate(hash: unknown): DefinesJsonCreate {
    return new DefinesJsonCreate((hash as { as_json: string }).as_json);
  }
  asJson(): { as_json: string } {
    return { as_json: this.value };
  }
}

class DefinesFromMsgpackExt extends DefinesJsonCreate {
  static fromMsgpackExt(string: unknown): DefinesFromMsgpackExt {
    return new DefinesFromMsgpackExt((string as string).replace(/msgpack_ext$/, ""));
  }
  toMsgpackExt(): string {
    return this.value + "msgpack_ext";
  }
}

class Unserializable extends HasValue {
  asJson(): Record<string, never> {
    return {};
  }
  toMsgpackExt(): string {
    return "";
  }
}

describe("MessagePackCacheSerializerTest", () => {
  const dump = (object: unknown) => MessagePack.CacheSerializer.dump(object);
  const load = (dumped: Uint8Array) => MessagePack.CacheSerializer.load(dumped);

  const assertRoundtrip = (object: unknown) => {
    const serialized = dump(object);
    expect(serialized).toBeInstanceOf(Uint8Array);

    const deserialized = load(serialized);
    expect((deserialized as object).constructor).toBe((object as object).constructor);
    expect(deserialized).toEqual(object);
  };

  beforeAll(() => {
    constSet(TopLevel, "DefinesJsonCreate", DefinesJsonCreate);
    constSet(TopLevel, "DefinesFromMsgpackExt", DefinesFromMsgpackExt);
  });

  it("includes signature in message", () => {
    expect(MessagePack.CacheSerializer.isSignature(dump(""))).toBeTruthy();
    expect(MessagePack.CacheSerializer.isSignature(Marshal.dump(""))).toBeFalsy();
    expect(MessagePack.CacheSerializer.isSignature(Buffer.from("{}"))).toBeFalsy();
  });

  it("#signature? handles non-ASCII-only non-binary-encoded strings", () => {
    expect(MessagePack.CacheSerializer.isSignature(dump("ümlaut"))).toBeTruthy();
    expect(MessagePack.CacheSerializer.isSignature("ümlaut")).toBeFalsy();
  });

  it("roundtrips Symbol", () => {
    assertRoundtrip(":some_symbol");
  });

  it("enshrines type IDs", () => {
    MessagePack.CacheSerializer.warmup();
    const actual = Object.fromEntries(
      MessagePack.CacheSerializer.messagePackFactory
        .registeredTypes()
        .map((e) => [e.type, e.class]),
    );
    expect(actual).toEqual({
      0: rbCSymbol,
      1: rbCInteger,
      2: BigDecimal,
      3: Rational,
      4: Complex,
      5: rbCDateTime,
      6: rbCDate,
      7: Time,
      8: TimeWithZone,
      9: TimeZone,
      10: Duration,
      11: Range,
      12: Set,
      13: Generic,
      14: IPAddr,
      15: Pathname,
      16: RegExp,
      17: HashWithIndifferentAccess,
      127: Object,
    });
  });

  it("roundtrips very large Integer", () => {
    assertRoundtrip(2n ** 512n);
  });

  it("roundtrips BigDecimal", () => {
    assertRoundtrip(new BigDecimal("9876543210.0123456789"));
  });

  it("roundtrips Rational", () => {
    assertRoundtrip(rational(1, 3));
  });

  it("optimizes Rational zero encoding", () => {
    assertRoundtrip(rational(0, 1));

    const serializedZero = dump(rational(0, 1));
    const serializedNonzero = dump(rational(1, 1));
    expect(serializedZero.length).toBeLessThan(serializedNonzero.length);
  });

  it("roundtrips Complex", () => {
    assertRoundtrip(complex(1, -1));
  });

  it("roundtrips Set", () => {
    assertRoundtrip(new Set([null, true, 2, "three"]));
  });

  it("roundtrips DateTime", () => {
    assertRoundtrip(
      DateTime.civil(
        1999,
        12,
        31,
        12,
        34,
        rational(56, 1).add(rational(789, 1000)),
        rational(-1, 2),
      ),
    );
    assertRoundtrip(DateTime.now());
  });

  it("roundtrips Date", () => {
    assertRoundtrip(Temporal.PlainDate.from("1999-12-31"));
    assertRoundtrip(Temporal.Now.plainDateISO());
  });

  it("roundtrips Time", () => {
    assertRoundtrip(Time.new(1999, 12, 31, 12, 34, new Rational(789, 1000).add(56), "-12:00"));
    assertRoundtrip(Time.now());
  });

  it("roundtrips ActiveSupport::TimeWithZone", () => {
    assertRoundtrip(
      new TimeWithZone(
        Temporal.Instant.from("1999-12-31T12:34:56.789Z"),
        TimeZone.find("Australia/Lord_Howe")!,
      ),
    );
    assertRoundtrip(Time.current());
  });

  it("roundtrips ActiveSupport::TimeZone", () => {
    assertRoundtrip(TimeZone.find("Eastern Time (US & Canada)")!);
  });

  it("roundtrips ActiveSupport::Duration", () => {
    assertRoundtrip(
      years(1)
        .plus(months(2))
        .plus(weeks(3))
        .plus(days(4))
        .plus(hours(5))
        .plus(minutes(6))
        .plus(seconds(7)),
    );
    assertRoundtrip(months(1).plus(days(1)));
  });

  it("roundtrips Range", () => {
    assertRoundtrip(new Range(1, 2));
    assertRoundtrip(new Range(1, 2, true));
    assertRoundtrip(new Range(1, null));
    assertRoundtrip(new Range(1, null, true));
    assertRoundtrip(new Range(null, 2));
    assertRoundtrip(new Range(null, 2, true));
    assertRoundtrip(new Range("1", "2"));
    assertRoundtrip(new Range("1", "2", true));
  });

  it("roundtrips URI::Generic", () => {
    assertRoundtrip(URI.parse("https://example.com/#test"));
  });

  it("roundtrips IPAddr", () => {
    assertRoundtrip(new IPAddr("127.0.0.1"));
    assertRoundtrip(new IPAddr("1.1.1.1/16"));
    expect((load(dump(new IPAddr("1.1.1.1/16"))) as IPAddr).prefix).toBe(16);

    assertRoundtrip(new IPAddr("::1"));
    assertRoundtrip(new IPAddr("1:1:1:1:1:1:1:1/64"));
    expect((load(dump(new IPAddr("1:1:1:1:1:1:1:1/64"))) as IPAddr).prefix).toBe(64);
  });

  it("roundtrips Pathname", () => {
    assertRoundtrip(new Pathname(import.meta.url));
  });

  it("roundtrips Regexp", () => {
    assertRoundtrip(/.*/s);
  });

  it("roundtrips ActiveSupport::HashWithIndifferentAccess", () => {
    assertRoundtrip(new HashWithIndifferentAccess({ a: true, b: 2, c: "three" }));
  });

  it("works with ENV['TRAILS_MAX_THREADS']", () => {
    const originalEnv = { ...ENV };
    setEnv("TRAILS_MAX_THREADS", "1");
    try {
      assertRoundtrip("value");
    } finally {
      for (const name of Object.keys(ENV)) if (!(name in originalEnv)) setEnv(name, undefined);
      for (const [name, value] of Object.entries(originalEnv)) setEnv(name, value);
    }
  });

  it("uses #to_msgpack_ext and ::from_msgpack_ext to roundtrip unregistered objects", () => {
    assertRoundtrip(new DefinesFromMsgpackExt("foo"));
  });

  it("uses #as_json and ::json_create to roundtrip unregistered objects", () => {
    assertRoundtrip(new DefinesJsonCreate("foo"));
  });

  it("raises error when unable to serialize an unregistered object", () => {
    expect(() => dump(new Unserializable("foo"))).toThrow(UnserializableObjectError);
  });

  it("raises error when serializing an unregistered object with an anonymous class", () => {
    const Anon = class extends DefinesFromMsgpackExt {};
    Object.defineProperty(Anon, "name", { value: "" });
    expect(() => dump(new Anon("foo"))).toThrow(UnserializableObjectError);
  });

  it("handles missing class gracefully", () => {
    const Klass = class extends DefinesFromMsgpackExt {};
    Object.defineProperty(Klass, "name", { value: "DoesNotActuallyExist" });

    const dumped = dump(new Klass("foo"));
    assertNotNil(dumped);
    expect(load(dumped)).toBeUndefined();
  });
});
