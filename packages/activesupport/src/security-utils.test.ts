import { describe, it, expect } from "vitest";
import { SecurityUtils } from "./security-utils.js";

describe("SecurityUtilsTest", () => {
  it("secure compare should perform string comparison", () => {
    expect(SecurityUtils.secureCompare("a", "a")).toBe(true);
    expect(SecurityUtils.secureCompare("a", "b")).toBe(false);
    expect(SecurityUtils.secureCompare("a", "A")).toBe(false);
    expect(SecurityUtils.secureCompare("foo bar", "foo bar")).toBe(true);
  });

  it("secure compare return false on bytesize mismatch", () => {
    expect(SecurityUtils.secureCompare("a", "ab")).toBe(false);
    expect(SecurityUtils.secureCompare("ab", "a")).toBe(false);
  });

  it("fixed length secure compare should perform string comparison", () => {
    expect(SecurityUtils.fixedLengthSecureCompare("a", "a")).toBe(true);
    expect(SecurityUtils.fixedLengthSecureCompare("a", "b")).toBe(false);
    expect(SecurityUtils.fixedLengthSecureCompare("abcdef", "abcdef")).toBe(true);
  });

  it("fixed length secure compare raise on length mismatch", () => {
    expect(() => {
      SecurityUtils.fixedLengthSecureCompare("a", "ab");
    }).toThrow("string length mismatch");
  });
});
