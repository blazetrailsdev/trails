import { describe, it, expect } from "vitest";
import { MessagePack, UnserializableObjectError } from "./index.js";

describe("MessagePackSerializerTest", () => {
  const dump = (object: unknown) => MessagePack.dump(object);
  const load = (dumped: Buffer) => MessagePack.load(dumped);
  const roundtrip = (object: unknown) => load(dump(object));

  it("raises friendly error when dumping an unsupported object", () => {
    class UnsupportedObject {}
    expect(() => dump(new UnsupportedObject())).toThrow(UnserializableObjectError);
  });

  it("includes signature in message", () => {
    expect(MessagePack.signature(dump(""))).toBe(true);
    expect(MessagePack.signature(Buffer.from("{}"))).toBe(false);
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

  it("rejects input without the signature", () => {
    expect(() => load(Buffer.from("hey there"))).toThrow();
  });
});
