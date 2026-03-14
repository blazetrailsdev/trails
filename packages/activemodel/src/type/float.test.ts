import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

describe("FloatTest", () => {
  it("changing float", () => {
    class MyModel extends Model {
      static {
        this.attribute("value", "float");
      }
    }
    const m = new MyModel({ value: 1.5 });
    m.writeAttribute("value", 2.5);
    expect(m.readAttribute("value")).toBe(2.5);
    expect(m.attributeChanged("value")).toBe(true);
  });

  it("type cast float", () => {
    const type = new Types.FloatType();
    expect(type.cast(42.5)).toBe(42.5);
    expect(type.cast("3.14")).toBe(3.14);
    expect(type.cast(null)).toBe(null);
  });

  it("type cast float from invalid string", () => {
    const type = new Types.FloatType();
    expect(type.cast("not-a-number")).toBe(null);
  });
});
