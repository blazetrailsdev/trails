import { describe, expect, it } from "vitest";
import { pathmapPartial } from "../lib/ext/string.js";

describe("TestRakePathMapPartial", () => {
  it("pathmap partial", () => {
    const path = "1/2/file";
    const call = (n: number) => pathmapPartial(path, n);
    expect(call(1)).toBe("1");
    expect(call(2)).toBe("1/2");
    expect(call(3)).toBe("1/2");
    expect(call(0)).toBe(".");
    expect(call(-1)).toBe("2");
    expect(call(-2)).toBe("1/2");
    expect(call(-3)).toBe("1/2");
  });
});
