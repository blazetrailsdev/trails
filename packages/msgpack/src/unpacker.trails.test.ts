import { describe, expect, it } from "vitest";
import { ExtensionValue, MessagePack, Unpacker } from "./index.js";

describe("MessagePack::Unpacker", () => {
  it("freezes an unknown ext and leaves a binary String readable under freeze", () => {
    const unpacker = new Unpacker({ freeze: true, allowUnknownExt: true });
    const bin = Uint8Array.of(1, 2);
    const packed = MessagePack.pack([bin, new ExtensionValue(5, bin)]);
    const [str, ext] = unpacker.feed(packed).read() as [Uint8Array, ExtensionValue];
    expect(str).toEqual(bin);
    expect(Object.isFrozen(ext)).toBe(true);
  });
});
