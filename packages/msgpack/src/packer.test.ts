import { beforeEach, describe, expect, it } from "vitest";
import { Packer } from "./index.js";

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
