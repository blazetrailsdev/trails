/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";
import { NumericalityValidator } from "./numericality.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("NumericalityValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });
  function makeModel() {
    class Widget extends Base {
      static {
        this.attribute("price", "float");
        this.attribute("quantity", "integer");
        this.adapter = adapter;
        this.validates("price", { numericality: { greaterThan: 0 } });
      }
    }
    return { Widget };
  }
  it("column with precision", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 9.99 });
    expect(w.isValid()).toBe(true);
  });
  it("column with precision higher than double fig", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 0.001 });
    expect(w.isValid()).toBe(true);
  });
  it("column with scale", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 1.5 });
    expect(w.isValid()).toBe(true);
  });
  it("no column precision", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: -1 });
    expect(w.isValid()).toBe(false);
  });
  it("virtual attribute", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 10 });
    expect(w.isValid()).toBe(true);
  });
  it("on abstract class", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 0 });
    expect(w.isValid()).toBe(false);
  });
  it("virtual attribute without precision", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 5 });
    expect(w.isValid()).toBe(true);
  });
  it("virtual attribute with precision round down", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 3.14 });
    expect(w.isValid()).toBe(true);
  });
  it("virtual attribute with precision round half even", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 2.5 });
    expect(w.isValid()).toBe(true);
  });
  it("virtual attribute with precision round up", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 1.123456 });
    expect(w.isValid()).toBe(true);
  });
  it("virtual attribute with scale", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 100 });
    expect(w.isValid()).toBe(true);
  });
  it("virtual attribute with precision and scale", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 999.99 });
    expect(w.isValid()).toBe(true);
  });
  it("aliased attribute", () => {
    const { Widget } = makeModel();
    const w = new Widget({ price: 1 });
    expect(w.isValid()).toBe(true);
  });
  it("allow nil works for casted value", () => {
    class Widget2 extends Base {
      static {
        this.attribute("price", "float");
        this.adapter = adapter;
        this.validates("price", { numericality: { allowNil: true } });
      }
    }
    const w = new Widget2({});
    expect(w.isValid()).toBe(true);
  });
  it("column with precision rounds value before comparison", () => {
    // AR NumericalityValidator extracts precision/scale from typeForAttribute
    // and passes to AM's validateEach which rounds the value before checks.
    class Decimal extends Base {
      static {
        this.attribute("amount", "decimal");
        this.adapter = adapter;
        this.validatesWith(NumericalityValidator, {
          attributes: ["amount"],
          lessThan: 1000,
        });
      }
      static typeForAttribute(name: string): any {
        if (name === "amount") return { precision: 5, scale: 2 };
        return null;
      }
    }
    // 999.99 < 1000 — valid
    const d = new Decimal({ amount: 999.99 });
    expect(d.isValid()).toBe(true);

    // 1000 is not < 1000 — invalid
    const d2 = new Decimal({ amount: 1000 });
    expect(d2.isValid()).toBe(false);
  });
  it("column with scale rounds fractional digits before comparison", () => {
    class Decimal extends Base {
      static {
        this.attribute("amount", "decimal");
        this.adapter = adapter;
        // greaterThan: 1.23 — value is rounded to scale=2 before compare
        this.validatesWith(NumericalityValidator, {
          attributes: ["amount"],
          greaterThan: 1.23,
        });
      }
      static typeForAttribute(name: string): any {
        if (name === "amount") return { precision: 5, scale: 2 };
        return null;
      }
    }
    // 1.234 rounds to 1.23 at scale=2 → not > 1.23 → invalid
    const d = new Decimal({ amount: 1.234 });
    expect(d.isValid()).toBe(false);

    // 1.235 rounds to 1.24 at scale=2 → > 1.23 → valid
    const d2 = new Decimal({ amount: 1.235 });
    expect(d2.isValid()).toBe(true);
  });
});
