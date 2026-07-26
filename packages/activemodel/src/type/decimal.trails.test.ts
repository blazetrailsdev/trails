import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("DecimalTypeTrails", () => {
  it("treats a reverted decimal as unchanged", () => {
    class MyModel extends Model {
      static {
        this.attribute("price", "decimal");
      }
    }
    const m = new MyModel({ price: "1.0" });
    m.writeAttribute("price", "1.0");
    expect(m.attributeChanged("price")).toBe(false);
  });
});
