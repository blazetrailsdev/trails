import { describe, it, expect } from "vitest";
import { Types, BinaryData } from "../index.js";

describe("BinaryTypeTrails", () => {
  it("serialize returns null for nil rather than wrapping it", () => {
    const type = new Types.BinaryType();
    expect(type.serialize(null)).toBe(null);
    expect(type.serialize(undefined)).toBe(null);
  });

  it("serialize wraps bytes without copying or decoding them", () => {
    const type = new Types.BinaryType();
    const bytes = new Uint8Array([0x80, 0xde, 0xad]);
    const result = type.serialize(bytes);
    expect(result).toBeInstanceOf(BinaryData);
    expect(result!.bytes).toEqual(bytes);
  });

  it("Data#equals compares bytes, not the decoded string", () => {
    const a = new BinaryData(new Uint8Array([0x80, 0x81]));
    const b = new BinaryData(new Uint8Array([0x82, 0x83]));
    expect(a.equals(b)).toBe(false);
    expect(a.equals(new BinaryData(new Uint8Array([0x80, 0x81])))).toBe(true);
  });

  it("Data#equals accepts the byte sources that stand in for a Ruby String", () => {
    const data = new BinaryData("hello");
    expect(data.equals("hello")).toBe(true);
    expect(data.equals(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toBe(true);
    expect(data.equals("hell")).toBe(false);
    expect(data.equals("hellO")).toBe(false);
  });

  it("Data#equals is false for values Ruby would fall through to identity on", () => {
    const data = new BinaryData("1");
    expect(data.equals(1)).toBe(false);
    expect(data.equals(null)).toBe(false);
    expect(data.equals(undefined)).toBe(false);
    expect(data.equals(data)).toBe(true);
  });
});

describe("BinaryType dirty tracking against Ruby value equality", () => {
  it("reports a byte-equal reassignment as unchanged", () => {
    const type = new Types.BinaryType();
    expect(type.isChanged(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0xde]), null)).toBe(
      false,
    );
    expect(type.isChanged(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0x01]), null)).toBe(
      true,
    );
  });

  it("isChangedInPlace deserializes the raw value and compares it by value", () => {
    const type = new Types.BinaryType();
    const raw = new Uint8Array([0x80, 0xde]);
    expect(type.isChangedInPlace(raw, new Uint8Array([0x80, 0xde]))).toBe(false);
    expect(type.isChangedInPlace(raw, new Uint8Array([0x80, 0xde, 0x7a]))).toBe(true);
  });
});
