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

  it("reads one object per step of an each enumerator", () => {
    const unpacker = new Unpacker().feed(Uint8Array.of(1, 2));
    expect([unpacker.each().next().value, unpacker.buffer.size()]).toEqual([1, 1]);
    expect([...unpacker.feedEach(Uint8Array.of(3))]).toEqual([2, 3]);
  });
});
