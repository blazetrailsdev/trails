import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, StringIO, rbCString, rbObjClass } from "@blazetrails/ruby-compat";
import {
  Array as ArrayExt,
  FalseClass,
  Float,
  Hash,
  Integer,
  NilClass,
  String as StringExt,
  TrueClass,
} from "./core-ext.js";
import { ExtensionValue, MessagePack, Packer } from "./index.js";

class ValueOne {
  constructor(readonly num: number) {}

  toMsgpackExt(): Uint8Array {
    return new Packer().write(this.num).toS();
  }
}

class ValueTwo extends ValueOne {}

describe("MessagePack::Packer", () => {
  let packer: Packer;
  beforeEach(() => {
    packer = new Packer();
  });

  it("write", () => {
    packer.write([]);
    expect(packer.toS()).toEqual(Uint8Array.of(0x90));
  });

  it("write_nil", () => {
    packer.writeNil();
    expect(packer.toS()).toEqual(Uint8Array.of(0xc0));
  });

  it("write_array_header 0", () => {
    packer.writeArrayHeader(0);
    expect(packer.toS()).toEqual(Uint8Array.of(0x90));
  });

  it("write_array_header 1", () => {
    packer.writeArrayHeader(1);
    expect(packer.toS()).toEqual(Uint8Array.of(0x91));
  });

  it("write_map_header 0", () => {
    packer.writeMapHeader(0);
    expect(packer.toS()).toEqual(Uint8Array.of(0x80));
  });

  it("write_map_header 1", () => {
    packer.writeMapHeader(1);
    expect(packer.toS()).toEqual(Uint8Array.of(0x81));
  });

  const binHeaders: [number, number[]][] = [
    [0, [0xc4, 0x00]],
    [255, [0xc4, 0xff]],
    [256, [0xc5, 0x01, 0x00]],
    [65535, [0xc5, 0xff, 0xff]],
    [65536, [0xc6, 0x00, 0x01, 0x00, 0x00]],
    [999999, [0xc6, 0x00, 0x0f, 0x42, 0x3f]],
  ];
  for (const [n, packed] of binHeaders) {
    it(`write_bin_header ${n}`, () => {
      packer.writeBinHeader(n);
      expect(packer.toS()).toEqual(Uint8Array.from(packed));
    });
  }

  it("write_bin", () => {
    packer.writeBin("hello");
    expect(packer.toS()).toEqual(Uint8Array.of(0xc4, 0x05, ...new TextEncoder().encode("hello")));
  });

  describe("#write_float32", () => {
    const tests: [string, number, number[]][] = [
      ["small floats", 3.14, [0xca, 0x40, 0x48, 0xf5, 0xc3]],
      ["big floats", Math.PI * 1_000_000_000_000_000_000, [0xca, 0x5e, 0x2e, 0x64, 0xb7]],
      ["negative floats", -2.1, [0xca, 0xc0, 0x06, 0x66, 0x66]],
      ["integer", 123, [0xca, 0x42, 0xf6, 0x00, 0x00]],
    ];

    for (const [ctx, numeric, packed] of tests) {
      describe(`with ${ctx}`, () => {
        it(`encodes ${numeric} as float32`, () => {
          packer.writeFloat32(numeric);
          expect(packer.toS()).toEqual(Uint8Array.from(packed));
        });
      });
    }

    describe("with non numeric", () => {
      it("raises argument error", () => {
        expect(() => packer.writeFloat32("abc")).toThrow(ArgumentError);
      });
    });
  });

  it("flush", () => {
    const io = new StringIO();
    const pk = new Packer(io);
    pk.writeNil();
    pk.flush();
    expect(pk.toS()).toEqual(new Uint8Array(0));
    expect(io.string()).toEqual("\xc0");
  });

  it("to_msgpack returns String", () => {
    expect(rbObjClass(NilClass.toMsgpack(null))).toBe(rbCString);
    expect(rbObjClass(TrueClass.toMsgpack(true))).toBe(rbCString);
    expect(rbObjClass(FalseClass.toMsgpack(false))).toBe(rbCString);
    expect(rbObjClass(Integer.toMsgpack(1))).toBe(rbCString);
    expect(rbObjClass(Float.toMsgpack(new Number(1.0)))).toBe(rbCString);
    expect(rbObjClass(StringExt.toMsgpack(""))).toBe(rbCString);
    expect(rbObjClass(Hash.toMsgpack({}))).toBe(rbCString);
    expect(rbObjClass(ArrayExt.toMsgpack([]))).toBe(rbCString);
  });

  it("to_msgpack with packer equals to_msgpack", () => {
    const toStr = (packer: unknown) => (packer as Packer).toStr();
    expect(toStr(NilClass.toMsgpack(null, new Packer()))).toEqual(NilClass.toMsgpack(null));
    expect(toStr(TrueClass.toMsgpack(true, new Packer()))).toEqual(TrueClass.toMsgpack(true));
    expect(toStr(FalseClass.toMsgpack(false, new Packer()))).toEqual(FalseClass.toMsgpack(false));
    expect(toStr(Integer.toMsgpack(1, new Packer()))).toEqual(Integer.toMsgpack(1));
    expect(toStr(Float.toMsgpack(new Number(1.0), new Packer()))).toEqual(
      Float.toMsgpack(new Number(1.0)),
    );
    expect(toStr(StringExt.toMsgpack("", new Packer()))).toEqual(StringExt.toMsgpack(""));
    expect(toStr(Hash.toMsgpack({}, new Packer()))).toEqual(Hash.toMsgpack({}));
    expect(toStr(ArrayExt.toMsgpack([], new Packer()))).toEqual(ArrayExt.toMsgpack([]));
  });

  class CustomPack01 {
    toMsgpack(pk: unknown = null): unknown {
      if (!(pk instanceof Packer)) return MessagePack.pack(this, pk);
      pk.writeArrayHeader(2);
      pk.write(1);
      pk.write(2);
      return pk;
    }
  }

  class CustomPack02 {
    toMsgpack(pk: unknown = null): unknown {
      return ArrayExt.toMsgpack([1, 2], pk);
    }
  }

  it("calls custom to_msgpack method", () => {
    expect(MessagePack.pack(new CustomPack01())).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(MessagePack.pack(new CustomPack02())).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(new CustomPack01().toMsgpack()).toEqual(ArrayExt.toMsgpack([1, 2]));
    expect(new CustomPack02().toMsgpack()).toEqual(ArrayExt.toMsgpack([1, 2]));
  });

  describe("#type_registered?", () => {
    it("receive Class or Integer, and return bool", () => {
      expect(packer.isTypeRegistered(0x00)).toBeFalsy();
      expect(packer.isTypeRegistered(0x01)).toBeFalsy();
      expect(packer.isTypeRegistered(ValueOne)).toBeFalsy();
    });

    it("returns true if specified type or class is already registered", () => {
      packer.registerType(0x30, ValueOne, "toMsgpackExt");
      packer.registerType(0x31, ValueTwo, "toMsgpackExt");

      expect(packer.isTypeRegistered(0x00)).toBeFalsy();
      expect(packer.isTypeRegistered(0x01)).toBeFalsy();

      expect(packer.isTypeRegistered(0x30)).toBeTruthy();
      expect(packer.isTypeRegistered(0x31)).toBeTruthy();
      expect(packer.isTypeRegistered(ValueOne)).toBeTruthy();
      expect(packer.isTypeRegistered(ValueTwo)).toBeTruthy();
    });
  });

  describe("#register_type", () => {
    it("returns a Hash which contains map of Class and type", () => {
      const packer = new Packer();
      packer.registerType(0x01, ValueOne, "toMsgpackExt");
      packer.registerType(0x02, ValueTwo, "toMsgpackExt");

      expect(packer.registeredTypes()).toBeInstanceOf(Array);
      expect(packer.registeredTypes().length).toEqual(2);

      const one = packer.registeredTypes()[0];
      expect(Object.keys(one).sort()).toEqual(["type", "class", "packer"].sort());
      expect(one.type).toEqual(0x01);
      expect(one.class).toEqual(ValueOne);
      expect(one.packer).toBeInstanceOf(Function);

      const two = packer.registeredTypes()[1];
      expect(Object.keys(two).sort()).toEqual(["type", "class", "packer"].sort());
      expect(two.type).toEqual(0x02);
      expect(two.class).toEqual(ValueTwo);
      expect(two.packer).toBeInstanceOf(Function);
    });
  });

  describe("ext formats", () => {
    [1, 2, 4, 8, 16].forEach((n, i) => {
      const b = [0xd4, 0xd5, 0xd6, 0xd7, 0xd8][i];
      it(`msgpack fixext ${n} format`, () => {
        expect(new ExtensionValue(1, "a".repeat(n)).toMsgpack()).toEqual(
          Uint8Array.of(b, 1, ...new TextEncoder().encode("a".repeat(n))),
        );
      });
    });
  });
});
