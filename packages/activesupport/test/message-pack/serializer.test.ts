import { describe, it, expect } from "vitest";
import { MessagePack, UnserializableObjectError } from "../../lib/message-pack.js";
import { DateTime, Temporal, Time } from "@blazetrails/date";
import {
  BigDecimal,
  Complex,
  Generic,
  IPAddr,
  Marshal,
  Pathname,
  Range,
  Rational,
  RuntimeError,
  URI,
  complex,
  env as ENV,
  rational,
  rbCDate,
  rbCDateTime,
  rbCInteger,
  rbCSymbol,
  rbEqual,
  setEnv,
} from "@blazetrails/ruby-compat";
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

describe("MessagePackSerializerTest", () => {
  const dump = (object: unknown) => MessagePack.dump(object);
  const load = (dumped: Uint8Array) => MessagePack.load(dumped);
  const roundtrip = (object: unknown) => load(dump(object));

  const assertRoundtrip = (object: unknown) => {
    const serialized = dump(object);
    expect(serialized).toBeInstanceOf(Uint8Array);

    const deserialized = load(serialized);
    expect((deserialized as object).constructor).toBe((object as object).constructor);
    expect(rbEqual(object, deserialized)).toBe(true);
  };

  it("raises friendly error when dumping an unsupported object", () => {
    class UnsupportedObject {}
    expect(() => dump(new UnsupportedObject())).toThrow(UnserializableObjectError);
  });

  it("includes signature in message", () => {
    expect(MessagePack.isSignature(dump(""))).toBeTruthy();
    expect(MessagePack.isSignature(Marshal.dump(""))).toBeFalsy();
    expect(MessagePack.isSignature(Buffer.from("{}"))).toBeFalsy();
  });

  it("roundtrips base types", () => {
    expect(roundtrip(null)).toBe(null);
    expect(roundtrip(true)).toBe(true);
    expect(roundtrip(42)).toBe(42);
    expect(roundtrip(-7)).toBe(-7);
    expect(roundtrip(1.5)).toBe(1.5);
    expect(roundtrip("hello")).toBe("hello");
    expect(roundtrip([1, "two", false])).toEqual([1, "two", false]);
    expect(roundtrip({ a: 1, b: "two" })).toEqual({ a: 1, b: "two" });
  });

  it("roundtrips Symbol", () => {
    assertRoundtrip(":some_symbol");
  });

  it.todo("dumps Symbol bytes identical to real Rails MessagePack");

  it("enshrines type IDs", () => {
    MessagePack.warmup();
    const actual = Object.fromEntries(
      MessagePack.messagePackFactory.registeredTypes().map((e) => [e.type, e.class]),
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

  it("roundtrips 64-bit native integers", () => {
    expect(roundtrip(2 ** 33)).toBe(2 ** 33);
    expect(roundtrip(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(roundtrip(-(2 ** 33))).toBe(-(2 ** 33));
    expect(roundtrip(2n ** 63n - 1n)).toBe(2n ** 63n - 1n);
    expect(roundtrip(2n ** 64n - 1n)).toBe(2n ** 64n - 1n);
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

  it("dumps native extension type bytes identical to real Rails MessagePack", () => {
    expect([...dump(2n ** 512n)]).toEqual([
      204, 128, 199, 69, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    expect([...dump(-(2n ** 512n))]).toEqual([
      204, 128, 199, 69, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    expect([...dump(2 ** 33)]).toEqual([204, 128, 207, 0, 0, 0, 2, 0, 0, 0, 0]);
    expect([...dump(2n ** 64n - 1n)]).toEqual([
      204, 128, 207, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    expect([...dump(new Set([null, true, 2, "three"]))]).toEqual([
      204, 128, 199, 10, 12, 148, 192, 195, 2, 165, 116, 104, 114, 101, 101,
    ]);
    expect([...dump(TimeZone.find("Eastern Time (US & Canada)")!)]).toEqual([
      204, 128, 199, 26, 9, 69, 97, 115, 116, 101, 114, 110, 32, 84, 105, 109, 101, 32, 40, 85, 83,
      32, 38, 32, 67, 97, 110, 97, 100, 97, 41,
    ]);
    expect([...dump(new HashWithIndifferentAccess({ a: true, b: 2, c: "three" }))]).toEqual([
      204, 128, 199, 15, 17, 131, 161, 97, 195, 161, 98, 2, 161, 99, 165, 116, 104, 114, 101, 101,
    ]);
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

  it("rejects input without the signature", () => {
    expect(() => load(Buffer.from("hey there"))).toThrow(RuntimeError);
    expect(() => load(Buffer.from("hey there"))).toThrow("Invalid serialization format");
  });
});
