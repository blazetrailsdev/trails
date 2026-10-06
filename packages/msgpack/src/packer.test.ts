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

  describe("#type_registered?", () => {
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
});
