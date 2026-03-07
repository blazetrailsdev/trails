import { describe, it, expect } from "vitest";
import { ArrayInquirer, arrayInquiry } from "./array-inquirer.js";

describe("ArrayInquirerTest", () => {
  it("individual", () => {
    const kinds = arrayInquiry(["phone", "tablet"]);
    expect((kinds as any).phone()).toBe(true);
    expect((kinds as any).laptop()).toBe(false);
  });

  it("any", () => {
    const kinds = arrayInquiry(["phone", "tablet"]);
    expect(kinds.any("phone", "laptop")).toBe(true);
    expect(kinds.any("laptop", "desktop")).toBe(false);
  });

  it("any string symbol mismatch", () => {
    const kinds = arrayInquiry(["phone"]);
    // "phone" vs "Phone" — case sensitive
    expect(kinds.any("Phone")).toBe(false);
    expect(kinds.any("phone")).toBe(true);
  });

  it("any with block", () => {
    const kinds = arrayInquiry(["phone", "tablet"]);
    expect(kinds.any((k) => k.startsWith("ph"))).toBe(true);
    expect(kinds.any((k) => k.startsWith("x"))).toBe(false);
  });

  it("respond to", () => {
    const kinds = arrayInquiry(["phone"]);
    expect(typeof (kinds as any).phone).toBe("function");
  });

  it("inquiry", () => {
    const arr = arrayInquiry(["a", "b"]);
    expect(arr.inquiry()).toBe(arr);
  });

  it("respond to fallback to array respond to", () => {
    const kinds = arrayInquiry(["phone"]);
    // Standard array methods still work
    expect(kinds.length).toBe(1);
    expect(Array.isArray(kinds)).toBe(true);
  });
});

describe("ArrayInquirer", () => {
  it("can be created directly", () => {
    const ai = new ArrayInquirer("foo", "bar");
    expect((ai as any).foo()).toBe(true);
    expect((ai as any).baz()).toBe(false);
  });

  it("any() with no args returns true when non-empty", () => {
    const ai = new ArrayInquirer("a", "b");
    expect(ai.any()).toBe(true);
  });

  it("any() with no args returns false when empty", () => {
    const ai = new ArrayInquirer();
    expect(ai.any()).toBe(false);
  });
});
