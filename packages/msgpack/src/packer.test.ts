import { beforeEach, describe, expect, it } from "vitest";
import { rbCString, rbObjClass } from "@blazetrails/ruby-compat";
import {
  Array as ArrayExt,
  FalseClass,
  Float,
  Hash,
  Integer,
  MessagePack,
  NilClass,
  Packer,
  String as StringExt,
  TrueClass,
} from "./index.js";

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
});
