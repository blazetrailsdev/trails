import { describe, it, expect } from "vitest";
import { StrictLocalsMismatch } from "./strict-locals.js";

describe("StrictLocalsMismatch", () => {
  it("is an instance of Error", () => {
    const e = new StrictLocalsMismatch(["extra"], ["count"]);
    expect(e).toBeInstanceOf(Error);
  });

  it("names itself ActionView::Template::StrictLocalsError", () => {
    const e = new StrictLocalsMismatch(["extra"], ["count"]);
    expect(e.name).toBe("ActionView::Template::StrictLocalsError");
  });

  it("surfaces the extra and allowed keys", () => {
    const e = new StrictLocalsMismatch(["foo", "bar"], ["count", "name"]);
    expect(e.extraKeys).toEqual(["foo", "bar"]);
    expect(e.allowedKeys).toEqual(["count", "name"]);
  });

  it("includes key names in the message", () => {
    const e = new StrictLocalsMismatch(["extra"], ["count"]);
    expect(e.message).toContain('"extra"');
    expect(e.message).toContain('"count"');
  });

  it("says (none) when no keys are allowed", () => {
    const e = new StrictLocalsMismatch(["x"], []);
    expect(e.message).toContain("(none)");
  });

  it("uses singular 'local' when one extra key", () => {
    const e = new StrictLocalsMismatch(["x"], ["y"]);
    expect(e.message).toMatch(/unknown local "/);
  });

  it("uses plural 'locals' when multiple extra keys", () => {
    const e = new StrictLocalsMismatch(["x", "y"], []);
    expect(e.message).toMatch(/unknown locals /);
  });
});
