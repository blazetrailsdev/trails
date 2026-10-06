import { describe, expect, it } from "vitest";
import { FrozenError, TypeError } from "@blazetrails/ruby-compat";
import { Factory } from "./index.js";

class MyType {
  toMsgpackExt(): Uint8Array {
    return Uint8Array.of(1);
  }

  static fromMsgpackExt(): MyType {
    return new this();
  }
}

describe("MessagePack::Factory", () => {
  it("a frozen factory denies new registrations and a pool takes a frozen dup", () => {
    const factory = new Factory();
    factory.registerType(0x00, MyType);
    const pool = factory.pool(2);
    factory.registerType(0x01, Set, { packer: null, unpacker: null });
    expect(pool.dump(new MyType())).toEqual(Uint8Array.of(0xd4, 0x00, 0x01));

    expect(factory.freeze()).toBe(factory);
    expect(() => factory.registerType(0x02, Array)).toThrow(
      new FrozenError("can't modify frozen MessagePack::Factory"),
    );
    expect(factory.dup().isTypeRegistered(0x01)).toBe(true);
    expect(Object.isFrozen(factory.dup())).toBe(false);
  });

  it("register_type raises TypeError for a packer or unpacker that is not callable", () => {
    const factory = new Factory();
    expect(() => factory.registerType(0x00, MyType, { packer: 1 })).toThrow(
      new TypeError("expected :packer argument to be a callable object, got: 1"),
    );
    expect(() => factory.registerType(0x00, MyType, { unpacker: 1 })).toThrow(
      new TypeError("expected :unpacker argument to be a callable object, got: 1"),
    );
  });

  it("a pool returns its member when an async block settles", async () => {
    const pool = new Factory().pool(1);
    let held: unknown;
    const payload = await pool.packer(async (packer) => {
      held = packer;
      await Promise.resolve();
      packer.write(1);
      return packer.toS();
    });
    expect(payload).toEqual(Uint8Array.of(0x01));
    pool.packer((packer) => {
      expect(packer).toBe(held);
      expect(packer.toS()).toEqual(new Uint8Array(0));
    });
  });
});
