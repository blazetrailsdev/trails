import { describe, expect, it } from "vitest";
import { base36, base58 } from "./securerandom.js";

describe("SecureRandomTest", () => {
  it("base58", () => {
    const s1 = base58();
    const s2 = base58();

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(16);
    expect(s1).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s2).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s1).toMatch(/^[^0OIl]+$/);
    expect(s2).toMatch(/^[^0OIl]+$/);
  });

  it("base58 with length", () => {
    const s1 = base58(24);
    const s2 = base58(24);

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(24);
    expect(s1).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s2).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s1).toMatch(/^[^0OIl]+$/);
    expect(s2).toMatch(/^[^0OIl]+$/);
  });

  it("base58 with nil", () => {
    const s1 = base58(null);
    const s2 = base58(null);

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(16);
    expect(s1).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s2).toMatch(/^[a-zA-Z0-9]+$/);
    expect(s1).toMatch(/^[^0OIl]+$/);
    expect(s2).toMatch(/^[^0OIl]+$/);
  });

  it("base36", () => {
    const s1 = base36();
    const s2 = base36();

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(16);
    expect(s1).toMatch(/^[a-z0-9]+$/);
    expect(s2).toMatch(/^[a-z0-9]+$/);
  });

  it("base36 with length", () => {
    const s1 = base36(24);
    const s2 = base36(24);

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(24);
    expect(s1).toMatch(/^[a-z0-9]+$/);
    expect(s2).toMatch(/^[a-z0-9]+$/);
  });

  it("base36 with nil", () => {
    const s1 = base36(null);
    const s2 = base36(null);

    expect(s1).not.toEqual(s2);
    expect(s1).toHaveLength(16);
    expect(s1).toMatch(/^[a-z0-9]+$/);
    expect(s2).toMatch(/^[a-z0-9]+$/);
  });
});
