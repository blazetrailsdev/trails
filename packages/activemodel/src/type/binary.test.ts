import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("BinaryTest", () => {
  it("type cast binary", () => {
    const type = new Types.BinaryType();

    expect(type.cast(null)).toBeNull();
    expect(type.cast(1)).toBe(1);

    expect(type.cast("1")).toEqual(new TextEncoder().encode("1"));
    expect((type.cast("1") as object).constructor).toBe(Uint8Array);

    expect(type.cast("ƒée")).toEqual(new TextEncoder().encode("ƒée"));
    expect(type.cast("ƒée")).not.toEqual("ƒée");
  });

  it("serialize binary strings", () => {
    const type = new Types.BinaryType();
    expect(type.serialize("ƒée")!.bytes).toEqual(new TextEncoder().encode("ƒée"));
    expect(type.serialize("ƒée")).not.toEqual("ƒée");
  });
});
