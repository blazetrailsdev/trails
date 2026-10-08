import { describe, expect, it } from "vitest";
import { rbFloatTypeP, rbIntegerTypeP } from "@blazetrails/ruby-compat";
import { ExtensionValue, MessagePack, Unpacker } from "./index.js";

describe("MessagePack::Unpacker", () => {
  it("reads a whole float32 and float64 as a Float wherever it is nested", () => {
    const float32 = [0xca, 0x40, 0x00, 0x00, 0x00];
    const float64 = [0xcb, 0x40, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const read = (bytes: number[]) => new Unpacker().feed(Uint8Array.from(bytes)).read();

    expect(read(float32)).toEqual(new Number(2));
    expect(read(float64)).toEqual(new Number(3));
    const array = read([0x93, ...float32, ...float64, 0x03]) as unknown[];
    expect(array.map(rbFloatTypeP)).toEqual([true, true, false]);
    expect(rbIntegerTypeP(array[2])).toBe(true);
    const nested = read([0x91, 0x91, ...float64]) as unknown[][];
    expect(rbFloatTypeP(nested[0][0])).toBe(true);
    const map = read([0x82, 0xa1, 0x61, ...float32, 0xa1, 0x62, 0x02]) as Record<string, unknown>;
    expect(rbFloatTypeP(map.a)).toBe(true);
    expect(rbFloatTypeP(map.b)).toBe(false);
    expect(read([0x81, ...float64, 0x01])).toEqual({ 3: 1 });
    expect(read([0xcb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0])).toBe(1.5);
  });

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
