import { describe, expect, it } from "vitest";
import { trTrans } from "./tr.js";

describe("trTrans", () => {
  it("translates identically when a (src, repl) pair repeats", () => {
    for (let i = 0; i < 3; i++) {
      expect(trTrans("hello", "a-y", "b-z", false)).toBe("ifmmp");
      expect(trTrans("hello", "^l", "*", false)).toBe("**ll*");
      expect(trTrans("aabbcc", "a-c", "x", true)).toBe("x");
      expect(trTrans("hello", "el", "ip", false)).toBe("hippo");
    }
  });

  it("raises an invalid range on every call, not only the first", () => {
    for (let i = 0; i < 2; i++) {
      expect(() => trTrans("x", "z-a", "b", false)).toThrow('invalid range "z-a"');
    }
  });
});
