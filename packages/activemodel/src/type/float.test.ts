import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
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
  });
});
