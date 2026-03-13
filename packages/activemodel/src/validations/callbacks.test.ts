import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("Validations Callbacks (ported)", () => {
    it("before validation and after validation callbacks should be called", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.beforeValidation(() => {
            order.push("before_validation");
          });
          this.afterValidation(() => {
            order.push("after_validation");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(order).toContain("before_validation");
      expect(order).toContain("after_validation");
    });

    it("before validation and after validation callbacks should be called in declared order", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(() => {
            order.push("first_before");
          });
          this.beforeValidation(() => {
            order.push("second_before");
          });
          this.afterValidation(() => {
            order.push("first_after");
          });
          this.afterValidation(() => {
            order.push("second_after");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(order.indexOf("first_before")).toBeLessThan(order.indexOf("second_before"));
      expect(order.indexOf("first_after")).toBeLessThan(order.indexOf("second_after"));
    });

    it("further callbacks should not be called if before validation throws abort", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(() => {
            order.push("before");
            return false;
          });
          this.afterValidation(() => {
            order.push("after");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(order).toContain("before");
      expect(order).not.toContain("after");
    });

    it("validation test should be done", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({});
      expect(p2.isValid()).toBe(false);
    });
  });
});
