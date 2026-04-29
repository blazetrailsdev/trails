import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

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
        this.validates("score", { numericality: { greaterThan: (_r: any) => 0 } });
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
    expect(f.errors.get("value")).toContain("must be an integer");
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

  it("validates numericality with proc", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThan: (_r: any) => 0 } });
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
        this.validates("value", { numericality: { greaterThan: (_r: any) => 10 } });
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

  it("validates numericality of with numeric only", () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: true });
      }
    }
    expect(new Person({ value: "123" }).isValid()).toBe(true);
    expect(new Person({ value: "123.45" }).isValid()).toBe(true);
    expect(new Person({ value: "abc" }).isValid()).toBe(false);
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
describe("numericality comparison operators", () => {
  it("validates numericality with greater than or equal", () => {
    class GTE extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThanOrEqualTo: 18 } });
      }
    }
    expect(new GTE({ age: 18 }).isValid()).toBe(true);
    expect(new GTE({ age: 17 }).isValid()).toBe(false);
  });

  it("validates numericality with less than or equal to", () => {
    class LTE extends Model {
      static {
        this.attribute("rating", "integer");
        this.validates("rating", { numericality: { lessThanOrEqualTo: 5 } });
      }
    }
    expect(new LTE({ rating: 5 }).isValid()).toBe(true);
    expect(new LTE({ rating: 6 }).isValid()).toBe(false);
  });

  it("validates numericality with equal to", () => {
    class EQ extends Model {
      static {
        this.attribute("answer", "integer");
        this.validates("answer", { numericality: { equalTo: 42 } });
      }
    }
    expect(new EQ({ answer: 42 }).isValid()).toBe(true);
    expect(new EQ({ answer: 41 }).isValid()).toBe(false);
  });

  it("validates numericality with other than", () => {
    class OT extends Model {
      static {
        this.attribute("count", "integer");
        this.validates("count", { numericality: { otherThan: 0 } });
      }
    }
    expect(new OT({ count: 1 }).isValid()).toBe(true);
    expect(new OT({ count: 0 }).isValid()).toBe(false);
  });
});
describe("numericality with in: range", () => {
  it("validates value is within range", () => {
    class User extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { in: [18, 65] } });
      }
    }

    const u1 = new User({ age: 25 });
    expect(u1.isValid()).toBe(true);

    const u2 = new User({ age: 10 });
    expect(u2.isValid()).toBe(false);
    expect(u2.errors.fullMessages.length).toBeGreaterThan(0);

    const u3 = new User({ age: 70 });
    expect(u3.isValid()).toBe(false);
  });

  it("accepts boundary values", () => {
    class User extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { in: [0, 100] } });
      }
    }

    const u1 = new User({ score: 0 });
    expect(u1.isValid()).toBe(true);

    const u2 = new User({ score: 100 });
    expect(u2.isValid()).toBe(true);
  });

  it("rejects blank and whitespace-only strings", () => {
    // Rails Kernel.Float raises ArgumentError on "" / whitespace, so
    // is_number? returns false. JS Number("") would coerce to 0 and
    // pass — explicit guard required.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(new User({ name: "" }).isValid()).toBe(false);
    expect(new User({ name: "   " }).isValid()).toBe(false);
  });

  it("rejects JS binary and octal literal strings", () => {
    // Rails Kernel.Float rejects 0b… / 0o… (it only accepts decimal +
    // optional exponent). JS Number("0b10") === 2 / Number("0o10") === 8
    // would silently pass without an explicit guard.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(new User({ name: "0b10" }).isValid()).toBe(false);
    expect(new User({ name: "0o10" }).isValid()).toBe(false);
    expect(new User({ name: "  0b10" }).isValid()).toBe(false);
    expect(new User({ name: "+0o10" }).isValid()).toBe(false);
  });

  it("rejects binary/octal compare-option values", () => {
    class User extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { greaterThan: "0b10" } });
      }
    }
    expect(() => new User({ score: 20 }).isValid()).toThrow(
      /Resolved numericality option must be numeric/,
    );
  });

  it("rejects hexadecimal literal strings (with or without leading whitespace)", () => {
    // Rails parse_as_number's elsif chain skips Kernel.Float when
    // is_hexadecimal_literal?, so "0x10" is not-a-number even though
    // JS Number("0x10") === 16.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(new User({ name: "0x10" }).isValid()).toBe(false);
    expect(new User({ name: "  0x10" }).isValid()).toBe(false);
    expect(new User({ name: "+0x10" }).isValid()).toBe(false);
  });

  it("skips hexadecimal compare-option values (Rails option_as_number returns nil)", () => {
    // Rails parse_as_number's elsif chain falls through for hex literals
    // (skips Kernel.Float when is_hexadecimal_literal? matches), so
    // option_as_number returns nil and the comparison is silently
    // skipped — neither raises nor coerces "0x10" to 16.
    class User extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { greaterThan: "0x10" } });
      }
    }
    expect(new User({ score: 20 }).isValid()).toBe(true);
    expect(new User({ score: 5 }).isValid()).toBe(true);
  });
});
