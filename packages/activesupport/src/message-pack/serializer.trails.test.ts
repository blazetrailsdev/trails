import { describe, expect, it } from "vitest";
import { BigDecimal, FrozenError } from "@blazetrails/ruby-compat";

import { Factory, MessagePackError } from "./factory.js";
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
    expect(() => pool.packer((packer) => packer.write(new Set()))).toThrow(MessagePackError);
  });
});
