import { describe, it, expect } from "vitest";
import { MessagePack, UnserializableObjectError } from "./index.js";
import { TimeZone } from "../values/time-zone.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";

describe("MessagePackSerializerTest", () => {
  const dump = (object: unknown) => MessagePack.dump(object);
  const load = (dumped: Buffer) => MessagePack.load(dumped);
  const roundtrip = (object: unknown) => load(dump(object));

  it("raises friendly error when dumping an unsupported object", () => {
    class UnsupportedObject {}
    expect(() => dump(new UnsupportedObject())).toThrow(UnserializableObjectError);
  });

  it("includes signature in message", () => {
    expect(MessagePack.isSignature(dump(""))).toBe(true);
    expect(MessagePack.isSignature(Buffer.from("{}"))).toBe(false);
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
    expect(roundtrip(Symbol.for("some_symbol"))).toBe(Symbol.for("some_symbol"));
  });

  // Pinned against real MRI Rails (activesupport 8.0.2):
  //   ActiveSupport::MessagePack.dump(:some_symbol).bytes
  it("dumps Symbol bytes identical to real Rails MessagePack", () => {
    const expected = [204, 128, 199, 11, 0, 115, 111, 109, 101, 95, 115, 121, 109, 98, 111, 108];
    expect([...dump(Symbol.for("some_symbol"))]).toEqual(expected);
  });

  // The remaining native extension types are registered by
  // activesupport-messagepack-native-extension-types. Type IDs without a
  // faithful, non-lossy JS representation are intentionally descoped (see PR):
  //   2 BigDecimal, 3 Rational, 4 Complex, 5 DateTime, 6 Date, 7 Time,
  //   8 TimeWithZone, 10 Duration, 11 Range, 13 URI, 14 IPAddr, 15 Pathname,
  //   16 Regexp.
  it("enshrines type IDs", () => {
    MessagePack.warmup();
    const actual = Object.fromEntries(
      MessagePack.messagePackFactory.registeredTypes().map((e) => [e.type, e.klass]),
    );
    expect(actual).toEqual({
      0: "Symbol",
      1: "Integer",
      9: "ActiveSupport::TimeZone",
      12: "Set",
      17: "ActiveSupport::HashWithIndifferentAccess",
      127: "Object",
    });
  });

  it("roundtrips very large Integer", () => {
    const value = 2n ** 512n;
    expect(roundtrip(value)).toBe(value);
    expect(roundtrip(-(2n ** 512n))).toBe(-(2n ** 512n));
  });

  it("roundtrips 64-bit native integers", () => {
    // Lifts the #3255 throw: integers across the full 64-bit native range encode
    // without routing through the bigint ext.
    expect(roundtrip(2 ** 33)).toBe(2 ** 33);
    expect(roundtrip(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(roundtrip(-(2 ** 33))).toBe(-(2 ** 33));
    expect(roundtrip(2n ** 63n - 1n)).toBe(2n ** 63n - 1n);
    expect(roundtrip(2n ** 64n - 1n)).toBe(2n ** 64n - 1n);
  });

  it("roundtrips Set", () => {
    expect(roundtrip(new Set([null, true, 2, "three"]))).toEqual(new Set([null, true, 2, "three"]));
  });

  it("roundtrips ActiveSupport::TimeZone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)");
    expect((roundtrip(zone) as TimeZone).name).toBe(zone.name);
  });

  it("roundtrips ActiveSupport::HashWithIndifferentAccess", () => {
    const hwia = new HashWithIndifferentAccess({ a: true, b: 2, c: "three" });
    const result = roundtrip(hwia) as HashWithIndifferentAccess;
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(result.toHash()).toEqual(hwia.toHash());
  });

  // Pinned against real MRI Rails (activesupport 8.0.2):
  //   ActiveSupport::MessagePack.dump(value).bytes
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
    expect([...dump(TimeZone.find("Eastern Time (US & Canada)"))]).toEqual([
      204, 128, 199, 26, 9, 69, 97, 115, 116, 101, 114, 110, 32, 84, 105, 109, 101, 32, 40, 85, 83,
      32, 38, 32, 67, 97, 110, 97, 100, 97, 41,
    ]);
    expect([...dump(new HashWithIndifferentAccess({ a: true, b: 2, c: "three" }))]).toEqual([
      204, 128, 199, 15, 17, 131, 161, 97, 195, 161, 98, 2, 161, 99, 165, 116, 104, 114, 101, 101,
    ]);
  });

  it("rejects input without the signature", () => {
    expect(() => load(Buffer.from("hey there"))).toThrow();
  });
});
