import { describe, expect, it } from "vitest";
import { MalformedFormatError, MessagePack, Timestamp } from "./index.js";

describe("MessagePack::Timestamp", () => {
  it("raises MalformedFormatError for a payload that is not 4, 8 or 12 bytes", () => {
    expect(() => {
      MessagePack.Timestamp.fromMsgpackExt(Uint8Array.of(0xd4, 0x00));
    }).toThrow(new MalformedFormatError("Invalid timestamp data size: 2"));
  });

  it("packs the three wire formats byte for byte", () => {
    expect(Timestamp.toMsgpackExt(1, 0)).toEqual(Uint8Array.of(0, 0, 0, 1));
    expect(Timestamp.toMsgpackExt(2 ** 34 - 1, 999_999_999)).toEqual(
      Uint8Array.of(0xee, 0x6b, 0x27, 0xff, 0xff, 0xff, 0xff, 0xff),
    );
    expect(Timestamp.toMsgpackExt(-1, 1)).toEqual(
      Uint8Array.of(0, 0, 0, 1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
    );
  });

  it("unpacks a timestamp64 whose seconds pass 32 bits, and a timestamp96 past 2**53", () => {
    const t = Timestamp.fromMsgpackExt(Timestamp.toMsgpackExt(2 ** 34 - 1, 999_999_999));
    expect([t.sec, t.nsec]).toEqual([2 ** 34 - 1, 999_999_999]);
    const max = Timestamp.fromMsgpackExt(Timestamp.toMsgpackExt(2n ** 63n - 1n, 0));
    expect(max.sec).toBe(2n ** 63n - 1n);
  });

  it("is not == a value of another class", () => {
    expect(new Timestamp(1, 0).equals({ sec: 1, nsec: 0 })).toBe(false);
  });
});
