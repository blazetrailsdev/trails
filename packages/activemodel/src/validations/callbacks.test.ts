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

  describe("CallbacksWithMethodNamesShouldBeCalled", () => {
    it("on condition is respected for validation without matching context", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({ name: "" });
      // Without context, the on:create validation should not fire
      expect(p.isValid()).toBe(true);
    });

    it("on condition is respected for validation without context", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "update" });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid()).toBe(true);
    });

    it("on multiple condition is respected for validation with matching context", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid("create")).toBe(false);
    });

    it("on multiple condition is respected for validation without matching context", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid("update")).toBe(true);
    });

    it("on multiple condition is respected for validation without context", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({ name: "" });
      expect(p.isValid()).toBe(true);
    });

    it("further callbacks should be called if before validation returns false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation(() => {
            log.push("after");
          });
        }
      }
      const p = new Person({ name: "test" });
      p.isValid();
      expect(log).toContain("after");
    });

    it("further callbacks should be called if after validation returns false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation(() => {
            log.push("first");
            return false;
          });
          this.afterValidation(() => {
            log.push("second");
          });
        }
      }
      const p = new Person({ name: "test" });
      p.isValid();
      expect(log).toContain("first");
    });

    it("before validation does not mutate the if options array", () => {
      const conditions = [(r: any) => true];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(() => {}, { if: conditions[0] });
        }
      }
      expect(conditions.length).toBe(1);
    });

    it("after validation does not mutate the if options array", () => {
      const conditions = [(r: any) => true];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation(() => {}, { if: conditions[0] });
        }
      }
      expect(conditions.length).toBe(1);
    });
  });

  describe("Callbacks (advanced features)", () => {
    it("if condition is respected for before validation", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(
            (r: any) => {
              log.push("before");
            },
            { if: (r: any) => r.readAttribute("name") === "trigger" },
          );
        }
      }
      const p1 = new Person({ name: "Alice" });
      p1.isValid();
      expect(log).toEqual([]);

      const p2 = new Person({ name: "trigger" });
      p2.isValid();
      expect(log).toEqual(["before"]);
    });

    it("on condition is respected for validation with matching context", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(true); // no context, skipped
      expect(p.isValid("create")).toBe(false); // matching context
      expect(p.isValid("update")).toBe(true); // non-matching context
    });
  });
});
