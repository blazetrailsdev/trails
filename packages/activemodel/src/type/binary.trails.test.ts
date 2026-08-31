import { describe, it, expect } from "vitest";
import { Types, BinaryData } from "../index.js";

describe("BinaryTypeTrails", () => {
  it("cast leaves an already-binary value untouched", () => {
    const type = new Types.BinaryType();
    const bytes = new TextEncoder().encode("ƒée");

    expect(type.cast(bytes)).toBe(bytes);
  });

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
