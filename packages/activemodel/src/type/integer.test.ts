import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

describe("ActiveModel", () => {
  describe("IntegerTest", () => {
    it("changed?", () => {
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
});
