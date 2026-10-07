import { describe, expect, it } from "vitest";
import { TypeError } from "@blazetrails/ruby-compat";
import { Integer, Symbol } from "./core-ext.js";
import { Packer } from "./index.js";

describe("MessagePack::CoreExt", () => {
  it("128.to_msgpack is ActiveSupport::MessagePack::Serializer's SIGNATURE", () => {
    expect(Integer.toMsgpack(128)).toEqual(Uint8Array.of(0xcc, 0x80));
  });

  it("packs a Symbol as its name, and an Integer past 2**53", () => {
    expect(Symbol.toMsgpack(":foo", new Packer())).toBeInstanceOf(Packer);
    expect((Symbol.toMsgpack(":foo", new Packer()) as Packer).toStr()).toEqual(
      Uint8Array.of(0xa3, 0x66, 0x6f, 0x6f),
    );
    expect((Integer.toMsgpack(2n ** 63n, new Packer()) as Packer).toStr()).toEqual(
      Uint8Array.of(0xcf, 0x80, 0, 0, 0, 0, 0, 0, 0),
    );
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
