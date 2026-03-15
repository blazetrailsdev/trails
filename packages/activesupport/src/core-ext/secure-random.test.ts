import { describe, expect, it } from "vitest";
import { secureRandomBase36, secureRandomBase58 } from "../key-generator.js";

describe("SecureRandomTest", () => {
  it("base58", () => {
    const s = secureRandomBase58();
    expect(s).toHaveLength(16);
    expect(s).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("base58 with length", () => {
    const s = secureRandomBase58(32);
    expect(s).toHaveLength(32);
  });

  it("base58 with nil", () => {
    // default length
    expect(secureRandomBase58()).toHaveLength(16);
  });

  it("base36", () => {
    const s = secureRandomBase36();
    expect(s).toHaveLength(16);
    expect(s).toMatch(/^[0-9a-z]+$/);
  });

  it("base36 with length", () => {
    const s = secureRandomBase36(24);
    expect(s).toHaveLength(24);
  });

  it("base36 with nil", () => {
    expect(secureRandomBase36()).toHaveLength(16);
  });
});
