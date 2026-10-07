import { beforeEach, describe, expect, it } from "vitest";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  FrozenError,
  Hash,
  NoMethodError,
  NotImplementedError,
  RangeError,
  rbCInteger,
  rbCSymbol,
} from "@blazetrails/ruby-compat";
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

class DummyTimeStamp1 {
  static TYPE = 15;

  readonly time: Time;

  constructor(
    readonly utime: number,
    readonly usec: number,
  ) {
    this.time = Time.at(utime, usec);
  }

  equals(other: DummyTimeStamp1): boolean {
    return this.utime === other.utime && this.usec === other.usec;
  }

  static typeId(): number {
    return 15;
  }

  static fromMsgpackExt(data: Uint8Array): DummyTimeStamp1 {
    return new this(...(new Uint32Array(data.slice().buffer) as unknown as [number, number]));
  }

  toMsgpackExt(): Uint8Array {
    return new Uint8Array(Uint32Array.of(this.utime, this.usec).buffer);
  }
}

class DummyTimeStamp2 {
  static TYPE = 16;

  readonly time: Time;

  constructor(
    readonly utime: number,
    readonly usec: number,
  ) {
    this.time = Time.at(utime, usec);
  }

  equals(other: DummyTimeStamp2): boolean {
    return this.utime === other.utime && this.usec === other.usec;
  }

  static deserialize(data: Uint8Array): DummyTimeStamp2 {
    return new this(
      ...(new TextDecoder().decode(data).split(",", 2).map(Number) as [number, number]),
    );
  }

  serialize(): string {
    return [this.utime, this.usec].map(String).join(",");
  }
}

function expectToChange(block: () => void, value: () => unknown): void {
  const before = value();
  block();
  expect(value()).not.toEqual(before);
}

function expectNotToChange(block: () => void, value: () => unknown): void {
  const before = value();
  block();
  expect(value()).toEqual(before);
}

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

    it("does not share the extension registry with unpackers", () => {
      subject.registerType(0x00, rbCSymbol);
      expectNotToChange(
        () => {
          const unpacker = subject.unpacker();
          expectToChange(
            () => {
              unpacker.registerType(0x01, null, null, () => {});
            },
            () => unpacker.registeredTypes(),
          );

          const secondUnpacker = subject.unpacker();
          expectNotToChange(
            () => {
              secondUnpacker.registerType(0x01, null, null, () => {});
            },
            () => unpacker.registeredTypes(),
          );
        },
        () => subject.registeredTypes(),
      );
    });
  });

  describe("#freeze", () => {
    it("can freeze factory instance to deny new registrations anymore", () => {
      subject.registerType(0x00, rbCSymbol);
      subject.freeze();
      expect(Object.isFrozen(subject)).toBeTruthy();
      expect(() => subject.registerType(0x01, Array)).toThrow(
        new FrozenError("can't modify frozen MessagePack::Factory"),
      );
    });
  });

  describe("#registered_types", () => {
    it("returns Array", () => {
      expect(subject.registeredTypes()).toBeInstanceOf(Array);
    });

    it("returns Array of Hash contains :type, :class, :packer, :unpacker", () => {
      subject.registerType(0x20, MyType);
      subject.registerType(0x21, MyType2);

      const list = subject.registeredTypes();

      expect(list.length).toEqual(2);
      expect(list[0]).toBeInstanceOf(Object);
      expect(list[1]).toBeInstanceOf(Object);
      expect(Object.keys(list[0]).sort()).toEqual(["type", "class", "packer", "unpacker"].sort());
      expect(Object.keys(list[1]).sort()).toEqual(["type", "class", "packer", "unpacker"].sort());

      expect(list[0].type).toEqual(0x20);
      expect(list[0].class).toEqual(MyType);
      expect(list[0].packer).toBeInstanceOf(Function);
      expect(list[0].unpacker).toBeInstanceOf(Function);

      expect(list[1].type).toEqual(0x21);
      expect(list[1].class).toEqual(MyType2);
      expect(list[1].packer).toBeInstanceOf(Function);
      expect(list[1].unpacker).toBeInstanceOf(Function);
    });

    it("returns Array of Hash which has nil for unregistered feature", () => {
      subject.registerType(0x20, MyType, { packer: "toMsgpackExt" });
      subject.registerType(0x21, MyType2, { unpacker: "fromMsgpackExt" });

      let list = subject.registeredTypes();

      expect(list.length).toEqual(2);
      expect(list[0]).toBeInstanceOf(Object);
      expect(list[1]).toBeInstanceOf(Object);
      expect(Object.keys(list[0]).sort()).toEqual(["type", "class", "packer", "unpacker"].sort());
      expect(Object.keys(list[1]).sort()).toEqual(["type", "class", "packer", "unpacker"].sort());

      expect(list[0].type).toEqual(0x20);
      expect(list[0].class).toEqual(MyType);
      expect(list[0].packer).toBeInstanceOf(Function);
      expect(list[0].unpacker).toBeNull();

      expect(list[1].type).toEqual(0x21);
      expect(list[1].class).toEqual(MyType2);
      expect(list[1].packer).toBeNull();
      expect(list[1].unpacker).toBeInstanceOf(Function);

      list = subject.registeredTypes("packer");
      expect(list.length).toEqual(1);
      expect(list[0]).toBeInstanceOf(Object);
      expect(Object.keys(list[0]).sort()).toEqual(["type", "class", "packer"].sort());

      expect(list[0].type).toEqual(0x20);
      expect(list[0].class).toEqual(MyType);
      expect(list[0].packer).toBeInstanceOf(Function);

      list = subject.registeredTypes("unpacker");
      expect(list.length).toEqual(1);
      expect(list[0]).toBeInstanceOf(Object);
      expect(Object.keys(list[0]).sort()).toEqual(["type", "class", "unpacker"].sort());

      expect(list[0].type).toEqual(0x21);
      expect(list[0].class).toEqual(MyType2);
      expect(list[0].unpacker).toBeInstanceOf(Function);
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

    describe("registering an ext type for Integer", () => {
      let factory: Factory;
      const bigint = 10n ** 150n;
      const integer = (data: Uint8Array) => BigInt(new TextDecoder().decode(data));
      beforeEach(() => {
        factory = new Factory();
      });

      it("does not work by default without passing `oversized_integer_extension: true`", () => {
        factory.registerType(0x01, rbCInteger, { packer: "toString", unpacker: integer });

        expect(() => {
          factory.dump(bigint);
        }).toThrow(RangeError);
      });

      it("raises ArgumentError if the type is not Integer", () => {
        expect(() => {
          factory.registerType(0x01, MyType, {
            packer: "toString",
            unpacker: integer,
            oversizedIntegerExtension: true,
          });
        }).toThrow(ArgumentError);
      });

      it("invokes the packer if registered with `oversized_integer_extension: true`", () => {
        factory.registerType(0x01, rbCInteger, {
          packer: "toString",
          unpacker: integer,
          oversizedIntegerExtension: true,
        });

        expect(factory.load(factory.dump(bigint)) == bigint).toBe(true);
      });

      it("does not use the oversized_integer_extension packer for integers fitting in native types", () => {
        factory.registerType(0x01, rbCInteger, {
          packer: () => {
            throw new NotImplementedError();
          },
          unpacker: () => {
            throw new NotImplementedError();
          },
          oversizedIntegerExtension: true,
        });

        expect(factory.dump(42)).toEqual(MessagePack.dump(42));
      });
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

  describe("under stressful GC", () => {
    it("works well", () => {
      const f = new Factory();
      f.registerType(0x0a, rbCSymbol);
    });

    it("does not crash in recursive extensions", () => {
      const myHashType = class extends Hash<unknown, unknown> {};
      const factory = new Factory();
      factory.registerType(7, myHashType, {
        packer: (value: Hash<unknown, unknown>, packer: Packer) => packer.write(value.toH()),
        unpacker: (unpacker: Unpacker) => new myHashType(unpacker.read()),
        recursive: true,
      });

      const payload = factory.dump([new myHashType()]);

      factory.load(payload);
    });
  });

  describe("DefaultFactory", () => {
    it("is a factory", () => {
      expect(MessagePack.DefaultFactory).toBeInstanceOf(MessagePack.Factory);
    });

    it("should be referred by MessagePack.pack and MessagePack.unpack", () => {
      MessagePack.DefaultFactory.registerType(DummyTimeStamp1.TYPE, DummyTimeStamp1);
      MessagePack.DefaultFactory.registerType(DummyTimeStamp2.TYPE, DummyTimeStamp2, {
        packer: "serialize",
        unpacker: "deserialize",
      });

      const t = Time.now();

      const dm1 = new DummyTimeStamp1(t.toI(), t.usec);
      expect(MessagePack.unpack(MessagePack.pack(dm1))).toEqual(dm1);

      const dm2 = new DummyTimeStamp1(t.toI(), t.usec);
      expect(MessagePack.unpack(MessagePack.pack(dm2))).toEqual(dm2);
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
