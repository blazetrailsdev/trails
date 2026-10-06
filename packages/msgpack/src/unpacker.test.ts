import { beforeEach, describe, expect, it } from "vitest";
import { EOFError } from "@blazetrails/ruby-compat";
import { MalformedFormatError, Unpacker } from "./index.js";

class ValueOne {
  constructor(readonly data: Uint8Array) {}

  static fromMsgpackExt(data: Uint8Array): ValueOne {
    return new this(data);
  }
}

class ValueTwo extends ValueOne {}

describe("MessagePack::Unpacker", () => {
  let unpacker: Unpacker;
  beforeEach(() => {
    unpacker = new Unpacker();
  });

  it("read raises EOFError before feeding", () => {
    expect(() => unpacker.read()).toThrow(EOFError);
  });

  it("reset clears internal buffer", () => {
    unpacker.feed(Uint8Array.of(0x91));
    unpacker.reset();
    unpacker.feed(Uint8Array.of(0x01));

    expect(unpacker.read()).toEqual(1);
  });

  it("read raises invalid byte error", () => {
    unpacker.feed(Uint8Array.of(0xc1));
    expect(() => unpacker.read()).toThrow(MalformedFormatError);
  });

  describe("#type_registered?", () => {
    it("receive Class or Integer, and return bool", () => {
      expect(unpacker.isTypeRegistered(0x00)).toBeFalsy();
      expect(unpacker.isTypeRegistered(0x01)).toBeFalsy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeFalsy();
    });

    it("returns true if specified type or class is already registered", () => {
      unpacker.registerType(0x30, ValueOne, "fromMsgpackExt");
      unpacker.registerType(0x31, ValueTwo, "fromMsgpackExt");

      expect(unpacker.isTypeRegistered(0x00)).toBeFalsy();
      expect(unpacker.isTypeRegistered(0x01)).toBeFalsy();

      expect(unpacker.isTypeRegistered(0x30)).toBeTruthy();
      expect(unpacker.isTypeRegistered(0x31)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueTwo)).toBeTruthy();
    });

    it("cannot detect unpack rule with block, not method", () => {
      unpacker.registerType(0x40, null, null, (data: Uint8Array) => ValueOne.fromMsgpackExt(data));

      expect(unpacker.isTypeRegistered(0x40)).toBeTruthy();
      expect(unpacker.isTypeRegistered(ValueOne)).toBeFalsy();
    });
  });
});
