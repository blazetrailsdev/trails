import { describe, it, expect } from "vitest";
import { tryCall } from "./try.js";
describe("tryCall", () => {
  it("returns undefined for null", () => {
    expect(tryCall(null, "any")).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(tryCall(undefined, "any")).toBeUndefined();
  });

  it("calls method with args", () => {
    const s = {
      padStart(n: number, c: string) {
        return "hi".padStart(n, c);
      },
    };
    expect(tryCall(s, "padStart", 5, "*")).toBe("***hi");
  });
});
