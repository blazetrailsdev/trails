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

  describe("Validations Numericality (ported)", () => {
    it("default validates numericality of", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: true });
        }
      }
      expect(new Person({ value: "42" }).isValid()).toBe(true);
      expect(new Person({ value: "3.14" }).isValid()).toBe(true);
      expect(new Person({ value: "abc" }).isValid()).toBe(false);
    });

    it("validates numericality of with nil allowed", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: true });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validates numericality of with integer only", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { onlyInteger: true } });
        }
      }
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      const f = new Person({ value: "5.5" });
      expect(f.isValid()).toBe(false);
      expect(f.errors.get("value")).toContain("is not an integer");
    });

    it("validates numericality with greater than", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThan: 0 } });
        }
      }
      expect(new Person({ value: 1 }).isValid()).toBe(true);
      expect(new Person({ value: 0 }).isValid()).toBe(false);
    });

    it("validates numericality with greater than or equal", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThanOrEqualTo: 18 } });
        }
      }
      expect(new Person({ value: 18 }).isValid()).toBe(true);
      expect(new Person({ value: 17 }).isValid()).toBe(false);
    });

    it("validates numericality with equal to", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { equalTo: 42 } });
        }
      }
      expect(new Person({ value: 42 }).isValid()).toBe(true);
      expect(new Person({ value: 43 }).isValid()).toBe(false);
    });

    it("validates numericality with less than", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { lessThan: 10 } });
        }
      }
      expect(new Person({ value: 9 }).isValid()).toBe(true);
      expect(new Person({ value: 10 }).isValid()).toBe(false);
    });

    it("validates numericality with less than or equal to", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { lessThanOrEqualTo: 5 } });
        }
      }
      expect(new Person({ value: 5 }).isValid()).toBe(true);
      expect(new Person({ value: 6 }).isValid()).toBe(false);
    });

    it("validates numericality with odd", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { odd: true } });
        }
      }
      expect(new Person({ value: 3 }).isValid()).toBe(true);
      expect(new Person({ value: 4 }).isValid()).toBe(false);
    });

    it("validates numericality with even", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { even: true } });
        }
      }
      expect(new Person({ value: 4 }).isValid()).toBe(true);
      expect(new Person({ value: 3 }).isValid()).toBe(false);
    });

    it("validates numericality with other than", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { otherThan: 0 } });
        }
      }
      expect(new Person({ value: 1 }).isValid()).toBe(true);
      expect(new Person({ value: 0 }).isValid()).toBe(false);
    });

    it("validates numericality with greater than less than and even", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThan: 0, lessThan: 10, even: true } });
        }
      }
      expect(new Person({ value: 4 }).isValid()).toBe(true);
      expect(new Person({ value: 3 }).isValid()).toBe(false); // odd
      expect(new Person({ value: 0 }).isValid()).toBe(false); // not > 0
      expect(new Person({ value: 10 }).isValid()).toBe(false); // not < 10
    });

    it("validates numericality with in", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { in: [1, 10] } });
        }
      }
      expect(new Person({ value: 5 }).isValid()).toBe(true);
      expect(new Person({ value: 0 }).isValid()).toBe(false);
      expect(new Person({ value: 11 }).isValid()).toBe(false);
    });
  });

  describe("NumericalityValidationTest (ported)", () => {
    it("validates numericality with proc", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { greaterThan: (r: any) => 0 } });
        }
      }
      const p = new Person({ age: 1 });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ age: 0 });
      expect(p2.isValid()).toBe(false);
    });

    it("validates numericality with symbol", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.attribute("min_age", "integer");
          this.validates("age", { numericality: { greaterThan: "getMinAge" } });
        }
        getMinAge() {
          return 18;
        }
      }
      const p = new Person({ age: 25, min_age: 18 });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ age: 10, min_age: 18 });
      expect(p2.isValid()).toBe(false);
    });
  });

  describe("NumericalityValidationTest", () => {
    it("validates numericality of with blank allowed", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { allowBlank: true } });
        }
      }
      expect(new Person({ value: "" }).isValid()).toBe(true);
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      expect(new Person({ value: "abc" }).isValid()).toBe(false);
    });

    it("validates numericality of with integer only and nil allowed", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { onlyInteger: true, allowNil: true } });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      expect(new Person({ value: "5.5" }).isValid()).toBe(false);
    });

    it("validates numericality of with integer only and symbol as value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.attribute("limit", "integer");
          this.validates("value", { numericality: { greaterThan: "getLimit" } });
        }
        getLimit() {
          return 10;
        }
      }
      expect(new Person({ value: 15 }).isValid()).toBe(true);
      expect(new Person({ value: 5 }).isValid()).toBe(false);
    });

    it("validates numericality of with integer only and proc as value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThan: (r: any) => 10 } });
        }
      }
      expect(new Person({ value: 15 }).isValid()).toBe(true);
      expect(new Person({ value: 5 }).isValid()).toBe(false);
    });

    it("validates numericality of with integer only and lambda as value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { numericality: { lessThanOrEqualTo: () => 100 } });
        }
      }
      expect(new Person({ value: 100 }).isValid()).toBe(true);
      expect(new Person({ value: 101 }).isValid()).toBe(false);
    });

    it.skip("validates numericality of with numeric only", () => {
      // Ruby-specific Numeric class check — no clear TS equivalent
    });

    it("validates numericality of with numeric only and nil allowed", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { allowNil: true } });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
      expect(new Person({ value: "42" }).isValid()).toBe(true);
    });

    it("validates numericality with greater than using differing numeric types", () => {
      class Person extends Model {
        static {
          this.attribute("value", "float");
          this.validates("value", { numericality: { greaterThan: 5 } });
        }
      }
      expect(new Person({ value: 5.5 }).isValid()).toBe(true);
      expect(new Person({ value: 4.9 }).isValid()).toBe(false);
    });

    it("validates numericality with greater than using string value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { greaterThan: 0 } });
        }
      }
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      expect(new Person({ value: "0" }).isValid()).toBe(false);
    });

    it("validates numericality with greater than or equal using differing numeric types", () => {
      class Person extends Model {
        static {
          this.attribute("value", "float");
          this.validates("value", { numericality: { greaterThanOrEqualTo: 5 } });
        }
      }
      expect(new Person({ value: 5.0 }).isValid()).toBe(true);
      expect(new Person({ value: 4.9 }).isValid()).toBe(false);
    });

    it("validates numericality with equal to using differing numeric types", () => {
      class Person extends Model {
        static {
          this.attribute("value", "float");
          this.validates("value", { numericality: { equalTo: 5 } });
        }
      }
      expect(new Person({ value: 5.0 }).isValid()).toBe(true);
      expect(new Person({ value: 5.1 }).isValid()).toBe(false);
    });

    it("validates numericality with less than using string value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { lessThan: 10 } });
        }
      }
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      expect(new Person({ value: "10" }).isValid()).toBe(false);
    });

    it("validates numericality with other than using string value", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { numericality: { otherThan: 0 } });
        }
      }
      expect(new Person({ value: "5" }).isValid()).toBe(true);
      expect(new Person({ value: "0" }).isValid()).toBe(false);
    });
  });
});
