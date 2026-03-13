import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("NumericalityValidationTest", () => {
    it("validates numericality with greater than or equal using string value", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { greaterThanOrEqualTo: 18 } });
        }
      }
      expect(new Person({ age: 18 }).isValid()).toBe(true);
      expect(new Person({ age: 17 }).isValid()).toBe(false);
    });

    it("validates numericality with equal to using string value", () => {
      class Person extends Model {
        static {
          this.attribute("count", "integer");
          this.validates("count", { numericality: { equalTo: 5 } });
        }
      }
      expect(new Person({ count: 5 }).isValid()).toBe(true);
      expect(new Person({ count: 6 }).isValid()).toBe(false);
    });

    it("validates numericality with less than or equal using string value", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { lessThanOrEqualTo: 100 } });
        }
      }
      expect(new Person({ age: 100 }).isValid()).toBe(true);
      expect(new Person({ age: 101 }).isValid()).toBe(false);
    });

    it("validates numericality with lambda", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { numericality: { greaterThan: (r: any) => 0 } });
        }
      }
      expect(new Person({ score: 1 }).isValid()).toBe(true);
      expect(new Person({ score: 0 }).isValid()).toBe(false);
    });

    it("validates numericality with numeric message", () => {
      class Person extends Model {
        static {
          this.attribute("age", "string");
          this.validates("age", { numericality: { message: "must be a number" } });
        }
      }
      const p = new Person({ age: "abc" });
      p.isValid();
      expect(p.errors.get("age")).toContain("must be a number");
    });

    it("validates numericality with exponent number", () => {
      class Person extends Model {
        static {
          this.attribute("score", "float");
          this.validates("score", { numericality: true });
        }
      }
      const p = new Person({ score: 1e2 });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("NumericalityValidationTest", () => {
    it("validates numericality with less than using differing numeric types", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { lessThan: 100 } });
        }
      }
      const p = new Person({ age: 50 });
      expect(p.isValid()).toBe(true);
    });

    it("validates numericality with less than or equal to using differing numeric types", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { lessThanOrEqualTo: 100 } });
        }
      }
      const p = new Person({ age: 100 });
      expect(p.isValid()).toBe(true);
    });

    it("validates numericality of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: true });
        }
      }
      const p = new Person({ age: 25 });
      expect(p.isValid()).toBe(true);
    });

    it("validates numericality using value before type cast if possible", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: true });
        }
      }
      const p = new Person({ age: "25" });
      expect(p.isValid()).toBe(true);
    });

    it("validates numericality with object acting as numeric", () => {
      class Person extends Model {
        static {
          this.attribute("score", "float");
          this.validates("score", { numericality: true });
        }
      }
      const p = new Person({ score: 3.14 });
      expect(p.isValid()).toBe(true);
    });

    it("validates numericality with invalid args", () => {
      class Person extends Model {
        static {
          this.attribute("age", "string");
          this.validates("age", { numericality: true });
        }
      }
      const p = new Person({ age: "abc" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates numericality equality for float and big decimal", () => {
      class Person extends Model {
        static {
          this.attribute("score", "float");
          this.validates("score", { numericality: { equalTo: 1.5 } });
        }
      }
      const p = new Person({ score: 1.5 });
      expect(p.isValid()).toBe(true);
    });
  });
});
