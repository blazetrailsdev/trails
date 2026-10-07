import { describe, expect, it } from "vitest";
import {
  BigDecimal,
  FrozenError,
  NoMethodError,
  RangeError,
  StandardError,
} from "@blazetrails/ruby-compat";

import { Factory, MalformedFormatError, UnknownExtTypeError, UnpackError } from "./factory.js";
import { Serializer } from "./serializer.js";

describe("MessagePackSerializerTrailsTest", () => {
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
    expect(factory.load("\x81\x01\x02")).toEqual({ 1: 2 });
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
