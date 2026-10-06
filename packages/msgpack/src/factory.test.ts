import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, FrozenError, NoMethodError } from "@blazetrails/ruby-compat";
import { Factory, MessagePack, Packer, UnknownExtTypeError, Unpacker } from "./index.js";

class MyType {
  constructor(
    readonly a: number,
    readonly b: number,
  ) {}

  toMsgpackExt(): Uint8Array {
    return Uint8Array.of(this.a, this.b);
  }

  static fromMsgpackExt(data: Uint8Array): MyType {
    return new this(data[0], data[1]);
  }

  toMsgpackExtOnlyA(): Uint8Array {
    return Uint8Array.of(this.a, 0);
  }

  static fromMsgpackExtOnlyB(data: Uint8Array): MyType {
    const [, b] = data;
    return new this(0, b);
  }
}

class MyType2 extends MyType {}

describe("MessagePack::Factory", () => {
  let subject: Factory;
  beforeEach(() => {
    subject = new Factory();
  });

  describe("#packer", () => {
    it("creates a Packer instance", () => {
      expect(subject.packer()).toBeInstanceOf(Packer);
    });

    it("creates new instance", () => {
      expect(subject.packer()).not.toBe(subject.packer());
    });
  });

  describe("#unpacker", () => {
    it("creates a Unpacker instance", () => {
      expect(subject.unpacker()).toBeInstanceOf(Unpacker);
    });

    it("creates new instance", () => {
      expect(subject.unpacker()).not.toBe(subject.unpacker());
    });
  });

  describe("#type_registered?", () => {
    it("receive Class or Integer, and return bool", () => {
      expect(subject.isTypeRegistered(0x00)).toBeFalsy();
      expect(subject.isTypeRegistered(0x01)).toBeFalsy();
      expect(subject.isTypeRegistered(MyType)).toBeFalsy();
    });

    it("has option to specify what types are registered for", () => {
      expect(subject.isTypeRegistered(0x00, "both")).toBeFalsy();
      expect(subject.isTypeRegistered(0x00, "packer")).toBeFalsy();
      expect(subject.isTypeRegistered(0x00, "unpacker")).toBeFalsy();
      expect(() => subject.isTypeRegistered(0x00, "something")).toThrow(ArgumentError);
    });

    it("returns true if specified type or class is already registered", () => {
      subject.registerType(0x20, MyType);
      subject.registerType(0x21, MyType2);

      expect(subject.isTypeRegistered(0x00)).toBeFalsy();
      expect(subject.isTypeRegistered(0x01)).toBeFalsy();

      expect(subject.isTypeRegistered(0x20)).toBeTruthy();
      expect(subject.isTypeRegistered(0x21)).toBeTruthy();
      expect(subject.isTypeRegistered(MyType)).toBeTruthy();
      expect(subject.isTypeRegistered(MyType2)).toBeTruthy();
    });
  });

  describe("#register_type", () => {
    let src: MyType;
    beforeEach(() => {
      src = new MyType(1, 2);
    });

    it("registers #to_msgpack_ext and .from_msgpack_ext by default", () => {
      subject.registerType(0x7f, MyType);

      const data = subject.packer().write(src).toS();
      const my = subject.unpacker().feed(data).read() as MyType;
      expect(my.a).toEqual(1);
      expect(my.b).toEqual(2);
    });

    it("registers custom packer method name", () => {
      subject.registerType(0x7f, MyType, {
        packer: "toMsgpackExtOnlyA",
        unpacker: "fromMsgpackExt",
      });

      const data = subject.packer().write(src).toS();
      const my = subject.unpacker().feed(data).read() as MyType;
      expect(my.a).toEqual(1);
      expect(my.b).toEqual(0);
    });

    it("registers custom unpacker method name", () => {
      subject.registerType(0x7f, MyType, {
        packer: "toMsgpackExt",
        unpacker: "fromMsgpackExtOnlyB",
      });

      const data = subject.packer().write(src).toS();
      const my = subject.unpacker().feed(data).read() as MyType;
      expect(my.a).toEqual(0);
      expect(my.b).toEqual(2);
    });

    it("registers custom proc objects", () => {
      const pk = (obj: MyType) => Uint8Array.of(obj.a + obj.b);
      const uk = (data: Uint8Array) => new MyType(data[0], -1);
      subject.registerType(0x7f, MyType, { packer: pk, unpacker: uk });

      const data = subject.packer().write(src).toS();
      const my = subject.unpacker().feed(data).read() as MyType;
      expect(my.a).toEqual(3);
      expect(my.b).toEqual(-1);
    });

    it("does not affect existent packer and unpackers", () => {
      subject.registerType(0x7f, MyType);
      const packer = subject.packer();
      const unpacker = subject.unpacker();

      subject.registerType(0x7f, MyType, {
        packer: "toMsgpackExtOnlyA",
        unpacker: "fromMsgpackExtOnlyB",
      });

      const data = packer.write(src).toS();
      const my = unpacker.feed(data).read() as MyType;
      expect(my.a).toEqual(1);
      expect(my.b).toEqual(2);
    });

    describe("registering ext type with recursive serialization", () => {
      it("can be nested", () => {
        const factory = new Factory();
        factory.registerType(0x02, Set, {
          packer: (set: Set<unknown>, packer: Packer) => {
            packer.write([...set]);
            return null;
          },
          unpacker: (unpacker: Unpacker) => new Set(unpacker.read() as unknown[]),
          recursive: true,
        });

        const expected = new Set([1, new Set([2, new Set([3])])]);
        const payload = factory.dump(expected);
        expect(payload).toEqual(
          Uint8Array.of(
            0xc7,
            0x0b,
            0x02,
            0x92,
            0x01,
            0xc7,
            0x06,
            0x02,
            0x92,
            0x02,
            0xd5,
            0x02,
            0x91,
            0x03,
          ),
        );
        expect(factory.load(factory.dump(expected))).toEqual(expected);
      });
    });
  });

  describe("DefaultFactory", () => {
    it("is a factory", () => {
      expect(MessagePack.DefaultFactory).toBeInstanceOf(MessagePack.Factory);
    });
  });

  describe("#pool", () => {
    let factory: Factory;
    beforeEach(() => {
      factory = new Factory();
    });

    it("responds to serializers interface", () => {
      const pool = factory.pool(1);
      expect(pool.load(pool.dump(42))).toEqual(42);
    });

    it("responds to #packer with a block", () => {
      const pool = factory.pool(1);
      const payload = pool.packer((packer) => {
        packer.write(42);
        return packer.fullPack();
      });
      expect(payload).toEqual(factory.dump(42));
    });

    it("responds to #unpacker with a block", () => {
      const pool = factory.pool(1);
      const payload = factory.dump(42);

      const object = pool.unpacker((unpacker) => {
        unpacker.feed(payload);
        return unpacker.read();
      });
      expect(object).toEqual(42);
    });

    it("#packer does not allow to register types", () => {
      const pool = factory.pool(1);
      expect(() => {
        pool.packer((packer) => {
          packer.registerType(0x20, MyType, null, () => "type");
        });
      }).toThrow(new FrozenError("can't modify frozen MessagePack::Packer"));
    });

    it("#unpacker does not allow to register types", () => {
      const pool = factory.pool(1);
      expect(() => {
        pool.unpacker((unpacker) => {
          unpacker.registerType(0x20, MyType, null, () => "type");
        });
      }).toThrow(new FrozenError("can't modify frozen MessagePack::Unpacker"));
    });

    it("types cannot be registered after the pool is created", () => {
      const pool = factory.pool(1);
      factory.registerType(0x20, MyType);

      expect(() => {
        pool.dump(new MyType(1, 2));
      }).toThrow(NoMethodError);

      const payload = factory.dump(new MyType(1, 2));
      expect(() => {
        pool.load(payload);
      }).toThrow(UnknownExtTypeError);
    });

    it("is thread safe", async () => {
      const pool = factory.pool(1);

      const threads = Array.from({ length: 10 }, async () => {
        for (let i = 0; i < 1_000; i++) {
          expect(pool.load(pool.dump(i))).toEqual(i);
        }
      });
      await Promise.all(threads);
    });
  });
});
