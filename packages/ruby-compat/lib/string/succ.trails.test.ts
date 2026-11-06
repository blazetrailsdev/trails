import { describe, it, expect } from "vitest";
import { succ } from "./succ.js";

describe("succ", () => {
  it("string succ carries within character classes", () => {
    expect(succ("abcd")).toBe("abce");
    expect(succ("az")).toBe("ba");
    expect(succ("zz")).toBe("aaa");
    expect(succ("Zz")).toBe("AAa");
    expect(succ("99")).toBe("100");
    expect(succ("a9")).toBe("b0");
    expect(succ("1.9")).toBe("2.0");
    expect(succ("<<")).toBe("<=");
    expect(succ("z.9")).toBe("z.10");
    expect(succ("a.z")).toBe("b.a");
    expect(succ("\u{1F600}")).toBe("\u{1F601}");
    const points = (str: string) => Array.from(str, (c) => c.codePointAt(0));
    expect(points(succ("\u{10FFFF}"))).toEqual([0x1, 0x10000]);
    expect(points(succ("\u{FFFF}"))).toEqual([0x1, 0x800]);
    expect(points(succ("\u{07FF}"))).toEqual([0x1, 0x80]);
  });
});
