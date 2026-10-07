import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  EOFError,
  Hash,
  Module,
  NoMethodError,
  include,
  rbCInteger,
  rbCSymbol,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import {
  Bigint,
  Buffer,
  Factory,
  MSGPACK_EXT_RECURSIVE,
  Packer,
  StackError,
  UnpackError,
  Unpacker,
} from "./index.js";
import { toMsgpackExt } from "./symbol.js";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const pack = (v: unknown) => hex(new Packer().write(v).fullPack());
const unpack = (...bytes: number[]) => new Unpacker().feed(Uint8Array.of(...bytes)).fullUnpack();

class Pair {
  constructor(
    readonly first: unknown,
    readonly second: unknown,
  ) {}
}

describe("MessagePack::Packer", () => {
  it("writes the bytes the gem writes", () => {
    expect(pack(128)).toBe("cc80");
    expect(pack(new Number(1))).toBe("cb3ff0000000000000");
    expect(pack(2 ** 40)).toBe("cf0000010000000000");
    expect(pack([1, "a", null, true, 1.5])).toBe("9501a161c0c3cb3ff8000000000000");
    expect(pack({ k: [2n ** 62n, -(2n ** 62n), 5n] })).toBe(
      "81a16b93cf4000000000000000d3c00000000000000005",
    );
    expect(pack(new Hash<string, string>().set("k", "v"))).toBe("81a16ba176");
    expect(pack(Uint8Array.of(1, 2))).toBe("c4020102");
    expect(pack(new Array(16).fill(0))).toBe("dc0010" + "00".repeat(16));
  });

  it("raises RangeError for an Integer outside 64 bits, and NoMethodError without to_msgpack", () => {
    expect(() => pack(2n ** 64n)).toThrow("bignum too big to convert into `unsigned long long'");
    expect(() => pack(-(2n ** 63n) - 1n)).toThrow("bignum too big to convert into `long long'");
    expect(() => pack(new Pair(1, 2))).toThrow(NoMethodError);
    expect(new Packer().writeArrayHeader(-1).toS()).toEqual(
      Uint8Array.of(0xdd, 255, 255, 255, 255),
    );
    expect(() => new Packer().writeMapHeader(-(2 ** 31) - 1)).toThrow(
      "integer -2147483649 too small to convert to `unsigned int'",
    );
    expect(() => new Packer().writeMapHeader(2 ** 32)).toThrow(
      "integer 4294967296 too big to convert to `unsigned int'",
    );
    expect(() => new Packer().registerType(1, {}, "toS")).toThrow(ArgumentError);
    expect(() => new Packer().registerType(1, Pair)).toThrow("undefined method `to_proc' for nil");
  });

  it("writes a subclass through its superclass's ext type, and refuses a frozen registry", () => {
    class Sub extends Pair {}
    const packer = new Packer();
    packer.registerType(1, Pair, null, () => "p");
    expect(packer.write(new Sub(1, 2)).toS()).toEqual(Uint8Array.of(0xd4, 1, 0x70));
    expect(() => packer.registerType(128, Pair, "toS")).toThrow(
      "integer 128 too big to convert to `signed char'",
    );
    expect(() => Object.freeze(new Packer()).registerType(1, Pair, "toS")).toThrow(
      "can't modify frozen MessagePack::Packer",
    );
  });

  it("packs and unpacks a recursive ext type through the packer and unpacker", () => {
    const packer = new Packer();
    const unpacker = new Unpacker();
    packer.extRegistry.set(Pair, [
      3,
      (pair: Pair, pk) => pk!.write(pair.first).write(pair.second),
      MSGPACK_EXT_RECURSIVE,
    ]);
    unpacker.extRegistry.set(3, [
      Pair,
      (uk: Unpacker) => new Pair(uk.read(), uk.read()),
      MSGPACK_EXT_RECURSIVE,
    ]);

    const src = [new Pair(5, new Pair("a", 2n ** 63n))];
    const dumped = packer.write(src).fullPack();
    expect(hex(dumped)).toBe("91c70f0305c70b03a161cf8000000000000000");
    expect(unpacker.feed(dumped).fullUnpack()).toEqual(src);
  });
});

describe("oversized_integer_extension", () => {
  const factory = new Factory();
  factory.registerType(1, rbCInteger, {
    packer: Bigint.toMsgpackExt,
    unpacker: Bigint.fromMsgpackExt,
    oversizedIntegerExtension: true,
  });
  const dump = (v: unknown) => hex(factory.dump(v));

  it("packs an Integer outside 64 bits as the ext type, byte for byte as the gem does", () => {
    expect(dump(2n ** 70n)).toBe("c70d0100000000000000000000000040");
    expect(dump(-(2n ** 70n))).toBe("c70d0101000000000000000000000040");
    expect(dump(2n ** 64n)).toBe("c70d0100000000000000000000000001");
    expect(dump(-(2n ** 63n) - 1n)).toBe("c70901010000000180000000");
    expect(dump(-(2n ** 63n))).toBe("c70901010000000080000000");
    for (const int of [2n ** 70n, -(2n ** 70n), -(2n ** 63n), [2n ** 64n]]) {
      expect(factory.load(factory.dump(int))).toEqual(int);
    }
  });

  it("leaves an Integer inside 64 bits on the native formats", () => {
    expect(dump(2n ** 62n)).toBe("cf4000000000000000");
    expect(dump(2n ** 64n - 1n)).toBe("cfffffffffffffffff");
    expect(dump(-(2n ** 62n))).toBe("d3c000000000000000");
    expect(dump(5n)).toBe("05");
  });

  it("is not carried over by Factory#dup, as Factory_dup does not copy it", () => {
    expect(() => factory.dup().dump(2n ** 64n)).toThrow(
      "bignum too big to convert into `unsigned long long'",
    );
  });
});

describe("ext registry lookup", () => {
  const Mod = new Module((mod) => mod.defineMethod("toMsgpackExt", () => "value_msgpacked"));
  const packed = Uint8Array.of(0xc7, 0x0f, 0x01, ...new TextEncoder().encode("value_msgpacked"));

  it("finds a Module a base class includes", () => {
    class Value {}
    include(Value, Mod);
    const packer = new Packer();
    packer.registerType(0x01, Mod, "toMsgpackExt");
    expect(packer.isTypeRegistered(Value)).toBe(true);
    expect(packer.isTypeRegistered(Pair)).toBe(false);
    expect(packer.write(new Value()).toS()).toEqual(packed);
  });

  it("looks up the singleton class, then the real class, then the singleton class's ancestors", () => {
    const object = new Pair(1, 2);
    const singleton = rbObjSingletonClass(object);
    const packer = new Packer();
    packer.registerType(0x02, Pair, null, () => "real");
    expect(packer.write(object).fullPack()).toEqual(Uint8Array.of(0xd6, 2, 0x72, 0x65, 0x61, 0x6c));
    packer.registerType(0x03, singleton, null, () => "s");
    expect(packer.write(object).fullPack()).toEqual(Uint8Array.of(0xd4, 3, 0x73));
    expect(packer.write(new Pair(1, 2)).fullPack()).toEqual(
      Uint8Array.of(0xd6, 2, 0x72, 0x65, 0x61, 0x6c),
    );

    const string = Uint8Array.of(1);
    packer.registerType(0x04, rbObjSingletonClass(string), null, () => "s");
    expect(packer.write(string).fullPack()).toEqual(Uint8Array.of(0xd4, 4, 0x73));
    expect(packer.write(Uint8Array.of(1)).fullPack()).toEqual(Uint8Array.of(0xc4, 1, 1));

    class Blob extends Uint8Array {}
    packer.registerType(0x05, Blob, null, () => "b");
    expect(packer.write(Blob.of(1)).fullPack()).toEqual(Uint8Array.of(0xd4, 5, 0x62));
    class Plain extends Uint8Array {}
    expect(packer.write(Plain.of(1)).fullPack()).toEqual(Uint8Array.of(0xc4, 1, 1));

    const extended = new Pair(1, 2);
    include(rbObjSingletonClass(extended), Mod);
    const other = new Packer();
    other.registerType(0x01, Mod, "toMsgpackExt");
    expect(other.write(extended).toS()).toEqual(packed);
  });
});

describe("Float, Symbol and Buffer", () => {
  it("packs -0.0 from its boxed Number, and a bare -0 as the Integer it reads as", () => {
    expect(pack(new Number(-0))).toBe("cb8000000000000000");
    expect(pack(-0)).toBe("00");
  });

  it("round-trips a Symbol through to_msgpack_ext and Symbol.from_msgpack_ext", () => {
    expect(toMsgpackExt.call(":foo")).toBe("foo");
    const unpacker = new Unpacker();
    unpacker.registerType(0, rbCSymbol, "fromMsgpackExt");
    expect(unpacker.feed(Uint8Array.of(0xc7, 3, 0, 0x66, 0x6f, 0x6f)).read()).toBe(":foo");
    unpacker.reset();
    expect(unpacker.feed(Uint8Array.of(0xd4, 0, 0xff)).read()).toBe(":\u00ff");
  });

  it("answers Buffer#to_s as to_str", () => {
    const buffer = new Buffer();
    buffer.write("ab");
    expect(buffer.toS()).toEqual(Uint8Array.of(0x61, 0x62));
  });
});

describe("MessagePack::Unpacker", () => {
  it("raises the gem's errors", () => {
    expect(StackError.prototype).toBeInstanceOf(UnpackError);
    expect(() => unpack(0xc1)).toThrow("invalid byte");
    expect(() => unpack(0x91)).toThrow("end of buffer reached");
    expect(() => unpack(1, 2)).toThrow("1 extra bytes after the deserialized object");
    expect(() => unpack(0xd4, 5, 0)).toThrow("unexpected extension type");
    const unpacker = new Unpacker();
    unpacker.registerType(5, null, null, () => {
      throw new globalThis.RangeError("boom");
    });
    expect(() => unpacker.feed(Uint8Array.of(0xd4, 5, 0)).read()).toThrow("boom");
    unpacker.reset();
    unpacker.registerType(6, null, null, () => [5n]);
    expect(unpacker.feed(Uint8Array.of(0xd4, 6, 0)).read()).toEqual([5n]);
    expect(() => Object.freeze(new Unpacker()).registerType(1, null, null, () => 1)).toThrow(
      "can't modify frozen MessagePack::Unpacker",
    );
  });

  it("unpacks a 64-bit Integer as a number wherever it is a safe one", () => {
    const src = { a: 2 ** 40, b: [2n ** 62n, -(2 ** 40)] };
    expect(new Unpacker().feed(new Packer().write(src).toS()).read()).toEqual(src);
  });

  it("reads one object per call and resumes once the rest of an object is fed", () => {
    const unpacker = new Unpacker();
    unpacker.feed(Uint8Array.of(0xcc, 0x80, 0x92, 1));
    expect(unpacker.read()).toBe(128);
    expect(() => unpacker.read()).toThrow(EOFError);
    unpacker.feed(Uint8Array.of(2));
    expect(unpacker.fullUnpack()).toEqual([1, 2]);
  });
});
