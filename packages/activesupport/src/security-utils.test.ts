import { describe, it, expect } from "vitest";
import { SecurityUtils } from "./security-utils.js";

describe("SecurityUtilsTest", () => {
  it("secure compare should perform string comparison", () => {
    expect(SecurityUtils.secureCompare("a", "a")).toBeTruthy();
    expect(SecurityUtils.secureCompare("a", "b")).toBeFalsy();
  });

  it("secure compare return false on bytesize mismatch", () => {
    expect(SecurityUtils.secureCompare("a", "ａ")).toBeFalsy();
  });

  it("fixed length secure compare should perform string comparison", () => {
    expect(SecurityUtils.fixedLengthSecureCompare("a", "a")).toBeTruthy();
    expect(SecurityUtils.fixedLengthSecureCompare("a", "b")).toBeFalsy();
  });

  it("fixed length secure compare raise on length mismatch", () => {
    expect(() => {
      SecurityUtils.fixedLengthSecureCompare("a", "ab");
    }).toThrow("string length mismatch");
  });
});
