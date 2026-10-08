import { describe, expect, it } from "vitest";
import { BigDecimal, FrozenError, IPAddr, Pathname, Range, URI } from "@blazetrails/ruby-compat";

import { Temporal, Time } from "@blazetrails/date";

import { Duration, days, hours, minutes, months, seconds, weeks, years } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { Factory } from "@blazetrails/msgpack";
import { Serializer } from "./serializer.js";

describe("MessagePackSerializerTrailsTest", () => {
  it("dumps Duration bytes identical to real Rails MessagePack", () => {
    const serializer = new Serializer();
    const duration = years(1)
      .plus(months(2))
      .plus(weeks(3))
      .plus(days(4))
      .plus(hours(5))
      .plus(minutes(6))
      .plus(seconds(7));
    expect([...serializer.dump(duration)]).toEqual([
      204, 128, 199, 13, 10, 206, 2, 83, 3, 123, 151, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect([...serializer.dump(months(1).plus(days(1)))]).toEqual([
      204, 128, 199, 13, 10, 206, 0, 41, 113, 242, 151, 192, 1, 192, 1, 192, 192, 192,
    ]);
    expect([...serializer.dump(seconds(1.5))]).toEqual([
      204, 128, 199, 25, 10, 203, 63, 248, 0, 0, 0, 0, 0, 0, 151, 192, 192, 192, 192, 192, 192, 203,
      63, 248, 0, 0, 0, 0, 0, 0,
    ]);
    expect([...serializer.dump(seconds(0))]).toEqual([
      204, 128, 199, 9, 10, 0, 151, 192, 192, 192, 192, 192, 192, 0,
    ]);
  });

  it("loads a Duration with the parts and variability it was dumped with", () => {
    const serializer = new Serializer();
    const roundtrip = (duration: Duration) =>
      serializer.load(serializer.dump(duration)) as Duration;

    const monthAndDay = roundtrip(months(1).plus(days(1)));
    expect(monthAndDay).toBeInstanceOf(Duration);
    expect(monthAndDay.value).toBe(2629746 + 86400);
    expect(monthAndDay._parts()).toEqual({ months: 1, days: 1 });
    expect(monthAndDay.isVariable()).toBe(true);

    const zero = roundtrip(seconds(0));
    expect(zero._parts()).toEqual({ seconds: 0 });
    expect(zero.isVariable()).toBe(false);

    expect(roundtrip(hours(1.5).negate())._parts()).toEqual({ hours: -1.5 });
  });

  it("dumps nanosecond temporal bytes identical to real Rails MessagePack", () => {
    const serializer = new Serializer();
    const time = Time.at(946686896, 123456789, "nanosecond", { in: "-12:00" });
    expect([...serializer.dump(time)]).toEqual([
      204, 128, 199, 15, 7, 206, 56, 109, 75, 176, 206, 7, 91, 205, 21, 210, 255, 255, 87, 64,
    ]);
    const loadedTime = serializer.load(serializer.dump(time)) as Time;
    expect(loadedTime.tvNsec).toBe(123456789);
    expect(loadedTime.utcOffset).toBe(-43200);

    const twz = new TimeWithZone(
      Time.at(954000000, 123456789, "nanosecond", { in: "UTC" }),
      TimeZone.find("Australia/Lord_Howe")!,
    );
    expect([...serializer.dump(twz)]).toEqual([
      204,
      128,
      199,
      31,
      8,
      206,
      56,
      220,
      226,
      128,
      206,
      7,
      91,
      205,
      21,
      0,
      179,
      ...Buffer.from("Australia/Lord_Howe"),
    ]);
    const loadedTwz = serializer.load(serializer.dump(twz)) as TimeWithZone;
    expect(loadedTwz.utc().tvNsec).toBe(123456789);
    expect(loadedTwz.timeZone.name).toBe("Australia/Lord_Howe");
    expect(loadedTwz.utcOffset).toBe(twz.utcOffset);

    const datetime = Temporal.PlainDateTime.from("1999-12-31T12:34:56.123456789");
    expect([...serializer.dump(datetime)]).toEqual([
      204, 128, 199, 19, 5, 206, 0, 37, 104, 88, 12, 34, 56, 206, 7, 91, 205, 21, 206, 59, 154, 202,
      0, 0,
    ]);
    expect(serializer.load(serializer.dump(datetime))).toEqual(datetime);

    expect([...serializer.dump(Temporal.PlainDate.from("1999-12-31"))]).toEqual([
      204, 128, 199, 5, 6, 206, 0, 37, 104, 88,
    ]);
  });

  it("dumps BigDecimal bytes identical to real Rails MessagePack", () => {
    const serializer = new Serializer();
    expect([...serializer.dump(new BigDecimal("9876543210.0123456789"))]).toEqual([
      204,
      128,
      199,
      28,
      2,
      ...Buffer.from("36:0.98765432100123456789e10"),
    ]);
    expect([...serializer.dump(new BigDecimal("1"))]).toEqual([
      204,
      128,
      215,
      2,
      ...Buffer.from("18:0.1e1"),
    ]);
  });

  it("dumps Range, URI, IPAddr, Pathname and Regexp bytes identical to real Rails MessagePack", () => {
    const serializer = new Serializer();
    const dump = (object: unknown) => [...serializer.dump(object)];
    expect(dump(new Range(1, 2))).toEqual([204, 128, 199, 3, 11, 1, 2, 194]);
    expect(dump(new Range(1, 2, true))).toEqual([204, 128, 199, 3, 11, 1, 2, 195]);
    expect(dump(new Range(1, null))).toEqual([204, 128, 199, 3, 11, 1, 192, 194]);
    expect(dump(new Range(null, 2, true))).toEqual([204, 128, 199, 3, 11, 192, 2, 195]);
    expect(dump(new Range("1", "2"))).toEqual([204, 128, 199, 5, 11, 161, 49, 161, 50, 194]);
    expect(dump(URI.parse("https://example.com/#test"))).toEqual([
      204,
      128,
      199,
      25,
      13,
      ...Buffer.from("https://example.com/#test"),
    ]);
    expect(dump(new IPAddr("127.0.0.1"))).toEqual([
      204,
      128,
      199,
      10,
      14,
      169,
      ...Buffer.from("127.0.0.1"),
    ]);
    expect(dump(new IPAddr("1.1.1.1/16"))).toEqual([
      204,
      128,
      199,
      11,
      14,
      170,
      ...Buffer.from("1.1.0.0/16"),
    ]);
    expect(dump(new IPAddr("::1"))).toEqual([204, 128, 214, 14, 163, ...Buffer.from("::1")]);
    expect(dump(new IPAddr("1:1:1:1:1:1:1:1/64"))).toEqual([
      204,
      128,
      199,
      13,
      14,
      172,
      ...Buffer.from("1:1:1:1::/64"),
    ]);
    expect(dump(new Pathname("/usr/bin/ruby"))).toEqual([
      204,
      128,
      199,
      13,
      15,
      ...Buffer.from("/usr/bin/ruby"),
    ]);
    expect(dump(/.*/s)).toEqual([204, 128, 199, 10, 16, ...Buffer.from("(?m-ix:.*)")]);
    expect(dump(/ab+c/i)).toEqual([204, 128, 199, 12, 16, ...Buffer.from("(?i-mx:ab+c)")]);
  });

  it("dumps a Regexp without the flags MRI has no option for", () => {
    const serializer = new Serializer();
    const loaded = serializer.load(serializer.dump(/^a/gimsuy)) as RegExp;
    expect([loaded.source, loaded.flags]).toEqual(["^a", "is"]);
  });

  it("loads the Regexp real Rails MessagePack dumps", () => {
    const serializer = new Serializer();
    const dumped = Buffer.from([204, 128, 199, 12, 16, ...Buffer.from("(?i-mx:ab+c)")]);
    const loaded = serializer.load(dumped) as RegExp;
    expect([loaded.source, loaded.flags]).toEqual(["ab+c", "i"]);
  });

  it("freezes the factory once the pool is built", () => {
    const serializer = new Serializer();
    serializer.warmup();
    expect(Object.isFrozen(serializer.messagePackFactory)).toBe(true);
    expect(() =>
      serializer.registerType(100, Set, {
        packer: () => "",
        unpacker: () => null,
      }),
    ).toThrow(FrozenError);
  });

  it("message_pack_factory= drops the memoized pool", () => {
    const serializer = new Serializer();
    serializer.warmup();
    const factory = new Factory();
    serializer.messagePackFactory = factory;
    expect(Object.isFrozen(factory)).toBe(false);
    expect(serializer.load(serializer.dump("value"))).toBe("value");
    expect(Object.isFrozen(factory)).toBe(true);
  });

  it("loads the Symbol real Rails MessagePack dumps", () => {
    const serializer = new Serializer();
    const dumped = Uint8Array.from([204, 128, 199, 11, 0, ...Buffer.from("some_symbol")]);
    expect(serializer.load(dumped)).toBe(":some_symbol");
  });
});
