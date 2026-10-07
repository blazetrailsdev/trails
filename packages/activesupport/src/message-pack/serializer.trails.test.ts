import { describe, expect, it } from "vitest";
import {
  BigDecimal,
  FrozenError,
  Hash,
  NoMethodError,
  RangeError,
  StandardError,
} from "@blazetrails/ruby-compat";

import { Temporal, Time } from "@blazetrails/date";

import { Duration, days, hours, minutes, months, seconds, weeks, years } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { Factory, MalformedFormatError, UnknownExtTypeError, UnpackError } from "./factory.js";
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

  it("freezes the factory once the pool is built", () => {
    const serializer = new Serializer();
    serializer.warmup();
    expect(serializer.messagePackFactory.isFrozen()).toBe(true);
    expect(() =>
      serializer.registerType({
        type: 100,
        klass: "Late",
        recursive: false,
        match: () => false,
        packer: () => Buffer.alloc(0),
        unpacker: () => null,
      }),
    ).toThrow(FrozenError);
  });

  it("message_pack_factory= drops the memoized pool", () => {
    const serializer = new Serializer();
    serializer.warmup();
    const factory = new Factory();
    serializer.messagePackFactory = factory;
    expect(factory.isFrozen()).toBe(false);
    expect(serializer.load(serializer.dump("value"))).toBe("value");
    expect(factory.isFrozen()).toBe(true);
  });

  it("pool hands a frozen dup of an unfrozen factory to the pool", () => {
    const factory = new Factory();
    const pool = factory.pool(1);
    expect(factory.isFrozen()).toBe(false);
    expect(pool.packer((packer) => (packer.write(1), packer.fullPack()))).toEqual(Buffer.from([1]));
    factory.registerType({
      type: 100,
      klass: "Set",
      recursive: true,
      match: (v) => v instanceof Set,
      packer: (v, packer) => packer.write([...(v as Set<unknown>)]),
      unpacker: () => null,
    });
    expect(() => pool.packer((packer) => packer.write(new Set()))).toThrow(NoMethodError);
    expect(() => pool.packer((packer) => packer.write(new Set()))).toThrow(
      "undefined method `to_msgpack' for an instance of Set",
    );
  });

  it("raises the msgpack gem's unpack errors", () => {
    const factory = new Factory();
    expect(() => factory.load("\x01\x01")).toThrow(MalformedFormatError);
    expect(() => factory.load("\x01\x01")).toThrow("1 extra bytes after the deserialized object");
    expect(() => factory.load("\x01\x01\x02\x03")).toThrow(
      "3 extra bytes after the deserialized object",
    );
    expect(() => factory.load("\xc1")).toThrow(MalformedFormatError);
    expect(() => factory.load("\xc1")).toThrow("invalid byte");
    expect(() => factory.load("\xd4\x05\x01")).toThrow(UnknownExtTypeError);
    expect(() => factory.load("\xd4\x05\x01")).toThrow("unexpected extension type");
    expect(() => factory.load("\xc7\x03\x7f\x01\x02\x03")).toThrow(UnknownExtTypeError);
    expect(new MalformedFormatError()).toBeInstanceOf(UnpackError);
    expect(new UnknownExtTypeError()).toBeInstanceOf(UnpackError);
    expect(new UnpackError()).toBeInstanceOf(StandardError);
  });

  it("reads a float 32 and a map keyed by a non-String, as the msgpack gem does", () => {
    const factory = new Factory();
    expect(factory.load("\xca\x3f\xc0\x00\x00")).toBe(1.5);
    const loaded = factory.load("\x82\x01\x02\x91\x01\x03") as Hash<unknown, unknown>;
    expect(loaded).toBeInstanceOf(Hash);
    expect(loaded.get(1)).toBe(2);
    expect([...loaded.keys()]).toEqual([1, [1]]);
    expect([...factory.dump(loaded)]).toEqual([0x82, 0x01, 0x02, 0x91, 0x01, 0x03]);
    expect(factory.load("\x81\xa1a\x02")).toEqual({ a: 2 });
  });

  it("raises RangeError for an Integer past 64 bits with no oversized-integer ext type", () => {
    const factory = new Factory();
    expect(() => factory.dump(2n ** 64n)).toThrow(RangeError);
    expect(() => factory.dump(2n ** 64n)).toThrow(
      "bignum too big to convert into `unsigned long long'",
    );
    expect(() => factory.dump(-(2n ** 63n) - 1n)).toThrow(
      "bignum too big to convert into `long long'",
    );
  });
});
