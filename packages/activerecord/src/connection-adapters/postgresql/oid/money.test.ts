import { describe, expect, it } from "vitest";

import { Money } from "./money.js";

describe("PostgreSQL::OID::Money", () => {
  it("scale is always 2 (Rails: def scale; 2; end)", () => {
    expect(new Money().scale).toBe(2);
  });

  it("castValue is the public Rails-named hook", () => {
    // cast delegates to castValue; both paths handle locale-formatted
    // money strings identically.
    expect(new Money().castValue("$1,234.56")).toBe("1234.56");
    expect(new Money().cast("$1,234.56")).toBe("1234.56");
  });
});
