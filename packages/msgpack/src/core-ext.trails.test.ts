import { describe, expect, it } from "vitest";
import { Hash, NoMethodError, TypeError, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ExtensionValue, Packer } from "./index.js";

describe("MessagePack::CoreExt", () => {
  it("128.to_msgpack is ActiveSupport::MessagePack::Serializer's SIGNATURE", () => {
    expect(rbFSend(128, "toMsgpack")).toEqual(Uint8Array.of(0xcc, 0x80));
  });

  it("packs a Symbol as its name, and an Integer past 2**53", () => {
    expect(rbFSend(":foo", "toMsgpack", new Packer())).toBeInstanceOf(Packer);
    expect((rbFSend(":foo", "toMsgpack", new Packer()) as Packer).toStr()).toEqual(
      Uint8Array.of(0xa3, 0x66, 0x6f, 0x6f),
    );
    expect((rbFSend(2n ** 63n, "toMsgpack", new Packer()) as Packer).toStr()).toEqual(
      Uint8Array.of(0xcf, 0x80, 0, 0, 0, 0, 0, 0, 0),
    );
  });

  it("seats to_msgpack on each core class, a Hash and ExtensionValue", () => {
    const packed = (v: unknown) => (rbFSend(v, "toMsgpack", new Packer()) as Packer).toStr();
    expect(packed(null)).toEqual(Uint8Array.of(0xc0));
    expect(packed(true)).toEqual(Uint8Array.of(0xc3));
    expect(packed(false)).toEqual(Uint8Array.of(0xc2));
    expect(packed(new Number(1))).toEqual(Uint8Array.of(0xcb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0));
    expect(packed("a")).toEqual(Uint8Array.of(0xa1, 0x61));
    expect(packed(new Hash().set("a", 1))).toEqual(Uint8Array.of(0x81, 0xa1, 0x61, 0x01));
    expect(packed(new ExtensionValue(1, "a"))).toEqual(Uint8Array.of(0xd4, 0x01, 0x61));
    expect(new ExtensionValue(1, "a").toMsgpack()).toEqual(Uint8Array.of(0xd4, 0x01, 0x61));
    expect(rbObjRespondTo(128, "toMsgpack")).toBe(true);
    expect(rbFSend(":foo", "toMsgpackExt")).toBe("foo");
  });

  it("leaves the global Array and a plain record without a to_msgpack of their own", () => {
    expect(() => rbFSend([], "toMsgpack")).toThrow(NoMethodError);
    expect(() => rbFSend({}, "toMsgpack")).toThrow(NoMethodError);
  });

  it("write_int packs a whole number past 2**53 as an Integer, never a Float", () => {
    expect(new Packer().writeInt(2 ** 60).toStr()).toEqual(
      Uint8Array.of(0xcf, 0x10, 0, 0, 0, 0, 0, 0, 0),
    );
  });

  it("raises TypeError for a value of the wrong type", () => {
    const packer = new Packer();
    expect(() => packer.writeFloat("hello")).toThrow(
      new TypeError("no implicit conversion to float from string"),
    );
    expect(() => packer.writeFloat(null)).toThrow(
      new TypeError("no implicit conversion to float from nil"),
    );
    expect(() => packer.writeFloat({})).toThrow("can't convert Hash into Float");
    expect(() => packer.writeString(1)).toThrow(TypeError);
    expect(() => packer.writeArray("hello")).toThrow(TypeError);
    expect(() => packer.writeHash("hello")).toThrow(TypeError);
    expect(() => packer.writeSymbol("hello")).toThrow(TypeError);
    expect(() => packer.writeInt("hello")).toThrow(TypeError);
  });
});
