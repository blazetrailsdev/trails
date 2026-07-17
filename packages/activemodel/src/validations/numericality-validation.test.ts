import { describe, it, expect, vi } from "vitest";
import { Model, Errors } from "../index.js";
import { prepareValueForValidation } from "./numericality.js";

describe("NumericalityValidationTest", () => {
  it("validates numericality with greater than or equal using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThanOrEqualTo: 18 } });
      }
    }
    expect(await new Person({ age: 18 }).isValid()).toBe(true);
    expect(await new Person({ age: 17 }).isValid()).toBe(false);
  });

  it("validates numericality with equal to using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("count", "integer");
        this.validates("count", { numericality: { equalTo: 5 } });
      }
    }
    expect(await new Person({ count: 5 }).isValid()).toBe(true);
    expect(await new Person({ count: 6 }).isValid()).toBe(false);
  });

  it("validates numericality with less than or equal using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { lessThanOrEqualTo: 100 } });
      }
    }
    expect(await new Person({ age: 100 }).isValid()).toBe(true);
    expect(await new Person({ age: 101 }).isValid()).toBe(false);
  });

  it("validates numericality with lambda", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { greaterThan: (_r: any) => 0 } });
      }
    }
    expect(await new Person({ score: 1 }).isValid()).toBe(true);
    expect(await new Person({ score: 0 }).isValid()).toBe(false);
  });

  it("validates numericality with numeric message", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "string");
        this.validates("age", { numericality: { message: "must be a number" } });
      }
    }
    const p = new Person({ age: "abc" });
    await p.isValid();
    expect(p.errors.get("age")).toContain("must be a number");
  });

  it("validates numericality with exponent number", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: true });
      }
    }
    const p = new Person({ score: 1e2 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality with less than using differing numeric types", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { lessThan: 100 } });
      }
    }
    const p = new Person({ age: 50 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality with less than or equal to using differing numeric types", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { lessThanOrEqualTo: 100 } });
      }
    }
    const p = new Person({ age: 100 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality of for ruby class", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: 25 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality using value before type cast if possible", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: "25" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality with object acting as numeric", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: true });
      }
    }
    const p = new Person({ score: 3.14 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates numericality with invalid args", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "string");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: "abc" });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates numericality equality for float and big decimal", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { equalTo: 1.5 } });
      }
    }
    const p = new Person({ score: 1.5 });
    expect(await p.isValid()).toBe(true);
  });

  it("default validates numericality of", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: true });
      }
    }
    expect(await new Person({ value: "42" }).isValid()).toBe(true);
    expect(await new Person({ value: "3.14" }).isValid()).toBe(true);
    expect(await new Person({ value: "abc" }).isValid()).toBe(false);
  });

  it("validates numericality of with nil allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { allowNil: true } });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("validates numericality of with integer only", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { onlyInteger: true } });
      }
    }
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    const f = new Person({ value: "5.5" });
    expect(await f.isValid()).toBe(false);
    expect(f.errors.get("value")).toContain("must be an integer");
  });

  it("validates numericality with greater than", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { greaterThan: 0 } });
      }
    }
    expect(await new Person({ value: 1 }).isValid()).toBe(true);
    expect(await new Person({ value: 0 }).isValid()).toBe(false);
  });

  it("validates numericality with greater than or equal", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { greaterThanOrEqualTo: 18 } });
      }
    }
    expect(await new Person({ value: 18 }).isValid()).toBe(true);
    expect(await new Person({ value: 17 }).isValid()).toBe(false);
  });

  it("validates numericality with equal to", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { equalTo: 42 } });
      }
    }
    expect(await new Person({ value: 42 }).isValid()).toBe(true);
    expect(await new Person({ value: 43 }).isValid()).toBe(false);
  });

  it("validates numericality with less than", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { lessThan: 10 } });
      }
    }
    expect(await new Person({ value: 9 }).isValid()).toBe(true);
    expect(await new Person({ value: 10 }).isValid()).toBe(false);
  });

  it("validates numericality with less than or equal to", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { lessThanOrEqualTo: 5 } });
      }
    }
    expect(await new Person({ value: 5 }).isValid()).toBe(true);
    expect(await new Person({ value: 6 }).isValid()).toBe(false);
  });

  it("validates numericality with odd", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { odd: true } });
      }
    }
    expect(await new Person({ value: 3 }).isValid()).toBe(true);
    expect(await new Person({ value: 4 }).isValid()).toBe(false);
  });

  it("validates numericality with even", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { even: true } });
      }
    }
    expect(await new Person({ value: 4 }).isValid()).toBe(true);
    expect(await new Person({ value: 3 }).isValid()).toBe(false);
  });

  it("validates numericality with other than", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { otherThan: 0 } });
      }
    }
    expect(await new Person({ value: 1 }).isValid()).toBe(true);
    expect(await new Person({ value: 0 }).isValid()).toBe(false);
  });

  it("validates numericality with greater than less than and even", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { greaterThan: 0, lessThan: 10, even: true } });
      }
    }
    expect(await new Person({ value: 4 }).isValid()).toBe(true);
    expect(await new Person({ value: 3 }).isValid()).toBe(false); // odd
    expect(await new Person({ value: 0 }).isValid()).toBe(false); // not > 0
    expect(await new Person({ value: 10 }).isValid()).toBe(false); // not < 10
  });

  it("validates numericality with in", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { in: [1, 10] } });
      }
    }
    expect(await new Person({ value: 5 }).isValid()).toBe(true);
    expect(await new Person({ value: 0 }).isValid()).toBe(false);
    expect(await new Person({ value: 11 }).isValid()).toBe(false);
  });

  it("validates numericality with proc", async () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThan: (_r: any) => 0 } });
      }
    }
    const p = new Person({ age: 1 });
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ age: 0 });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates numericality with symbol", async () => {
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
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({ age: 10, min_age: 18 });
    expect(await p2.isValid()).toBe(false);
  });

  it("validates numericality of with blank allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { allowBlank: true } });
      }
    }
    expect(await new Person({ value: "" }).isValid()).toBe(true);
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    expect(await new Person({ value: "abc" }).isValid()).toBe(false);
  });

  it("validates numericality of with integer only and nil allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { onlyInteger: true, allowNil: true } });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    expect(await new Person({ value: "5.5" }).isValid()).toBe(false);
  });

  it("validates numericality of with integer only and symbol as value", async () => {
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
    expect(await new Person({ value: 15 }).isValid()).toBe(true);
    expect(await new Person({ value: 5 }).isValid()).toBe(false);
  });

  it("validates numericality of with integer only and proc as value", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { greaterThan: (_r: any) => 10 } });
      }
    }
    expect(await new Person({ value: 15 }).isValid()).toBe(true);
    expect(await new Person({ value: 5 }).isValid()).toBe(false);
  });

  it("validates numericality of with integer only and lambda as value", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "integer");
        this.validates("value", { numericality: { lessThanOrEqualTo: () => 100 } });
      }
    }
    expect(await new Person({ value: 100 }).isValid()).toBe(true);
    expect(await new Person({ value: 101 }).isValid()).toBe(false);
  });

  it("validates numericality of with numeric only", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: true });
      }
    }
    expect(await new Person({ value: "123" }).isValid()).toBe(true);
    expect(await new Person({ value: "123.45" }).isValid()).toBe(true);
    expect(await new Person({ value: "abc" }).isValid()).toBe(false);
  });

  it("validates numericality of with numeric only and nil allowed", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { allowNil: true } });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
    expect(await new Person({ value: "42" }).isValid()).toBe(true);
  });

  it("validates numericality with greater than using differing numeric types", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "float");
        this.validates("value", { numericality: { greaterThan: 5 } });
      }
    }
    expect(await new Person({ value: 5.5 }).isValid()).toBe(true);
    expect(await new Person({ value: 4.9 }).isValid()).toBe(false);
  });

  it("validates numericality with greater than using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { greaterThan: 0 } });
      }
    }
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    expect(await new Person({ value: "0" }).isValid()).toBe(false);
  });

  it("validates numericality with greater than or equal using differing numeric types", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "float");
        this.validates("value", { numericality: { greaterThanOrEqualTo: 5 } });
      }
    }
    expect(await new Person({ value: 5.0 }).isValid()).toBe(true);
    expect(await new Person({ value: 4.9 }).isValid()).toBe(false);
  });

  it("validates numericality with equal to using differing numeric types", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "float");
        this.validates("value", { numericality: { equalTo: 5 } });
      }
    }
    expect(await new Person({ value: 5.0 }).isValid()).toBe(true);
    expect(await new Person({ value: 5.1 }).isValid()).toBe(false);
  });

  it("validates numericality with less than using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { lessThan: 10 } });
      }
    }
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    expect(await new Person({ value: "10" }).isValid()).toBe(false);
  });

  it("validates numericality with other than using string value", async () => {
    class Person extends Model {
      static {
        this.attribute("value", "string");
        this.validates("value", { numericality: { otherThan: 0 } });
      }
    }
    expect(await new Person({ value: "5" }).isValid()).toBe(true);
    expect(await new Person({ value: "0" }).isValid()).toBe(false);
  });
});
describe("numericality comparison operators", () => {
  it("validates numericality with greater than or equal", async () => {
    class GTE extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThanOrEqualTo: 18 } });
      }
    }
    expect(await new GTE({ age: 18 }).isValid()).toBe(true);
    expect(await new GTE({ age: 17 }).isValid()).toBe(false);
  });

  it("validates numericality with less than or equal to", async () => {
    class LTE extends Model {
      static {
        this.attribute("rating", "integer");
        this.validates("rating", { numericality: { lessThanOrEqualTo: 5 } });
      }
    }
    expect(await new LTE({ rating: 5 }).isValid()).toBe(true);
    expect(await new LTE({ rating: 6 }).isValid()).toBe(false);
  });

  it("validates numericality with equal to", async () => {
    class EQ extends Model {
      static {
        this.attribute("answer", "integer");
        this.validates("answer", { numericality: { equalTo: 42 } });
      }
    }
    expect(await new EQ({ answer: 42 }).isValid()).toBe(true);
    expect(await new EQ({ answer: 41 }).isValid()).toBe(false);
  });

  it("validates numericality with other than", async () => {
    class OT extends Model {
      static {
        this.attribute("count", "integer");
        this.validates("count", { numericality: { otherThan: 0 } });
      }
    }
    expect(await new OT({ count: 1 }).isValid()).toBe(true);
    expect(await new OT({ count: 0 }).isValid()).toBe(false);
  });
});
describe("numericality with in: range", () => {
  it("validates value is within range", async () => {
    class User extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: { in: [18, 65] } });
      }
    }

    const u1 = new User({ age: 25 });
    expect(await u1.isValid()).toBe(true);

    const u2 = new User({ age: 10 });
    expect(await u2.isValid()).toBe(false);
    expect(u2.errors.fullMessages.length).toBeGreaterThan(0);

    const u3 = new User({ age: 70 });
    expect(await u3.isValid()).toBe(false);
  });

  it("accepts boundary values", async () => {
    class User extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { in: [0, 100] } });
      }
    }

    const u1 = new User({ score: 0 });
    expect(await u1.isValid()).toBe(true);

    const u2 = new User({ score: 100 });
    expect(await u2.isValid()).toBe(true);
  });

  it("rejects blank and whitespace-only strings", async () => {
    // Rails Kernel.Float raises ArgumentError on "" / whitespace, so
    // is_number? returns false. JS Number("") would coerce to 0 and
    // pass — explicit guard required.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(await new User({ name: "" }).isValid()).toBe(false);
    expect(await new User({ name: "   " }).isValid()).toBe(false);
  });

  it("rejects JS binary and octal literal strings", async () => {
    // Rails Kernel.Float rejects 0b… / 0o… (it only accepts decimal +
    // optional exponent). JS Number("0b10") === 2 / Number("0o10") === 8
    // would silently pass without an explicit guard.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(await new User({ name: "0b10" }).isValid()).toBe(false);
    expect(await new User({ name: "0o10" }).isValid()).toBe(false);
    expect(await new User({ name: "  0b10" }).isValid()).toBe(false);
    expect(await new User({ name: "+0o10" }).isValid()).toBe(false);
  });

  it("rejects binary/octal compare-option values", async () => {
    class User extends Model {
      static {
        this.attribute("score", "integer");
        this.validates("score", { numericality: { greaterThan: "0b10" } });
      }
    }
    await expect(new User({ score: 20 }).isValid()).rejects.toThrow(
      /Resolved numericality option must be numeric/,
    );
  });

  it("rejects hexadecimal literal strings (with or without leading whitespace)", async () => {
    // Rails parse_as_number's elsif chain skips Kernel.Float when
    // is_hexadecimal_literal?, so "0x10" is not-a-number even though
    // JS Number("0x10") === 16.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(await new User({ name: "0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "  0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "+0x10" }).isValid()).toBe(false);
  });

  it("skips hexadecimal compare-option values (Rails option_as_number returns nil)", async () => {
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
    expect(await new User({ score: 20 }).isValid()).toBe(true);
    expect(await new User({ score: 5 }).isValid()).toBe(true);
  });

  it("rejects non-string/non-number values (boolean, Temporal.Instant, plain object)", async () => {
    // Rails Kernel.Float raises TypeError for non-Numeric/non-String
    // input, so is_number? returns false. In JS, Number(true) === 1
    // and Number(<object with valueOf>) can coerce silently — the
    // explicit string|number narrowing in isNumber prevents that.
    // (Trails casts datetime attributes to Temporal.Instant, not JS
    // Date, so the datetime case below exercises the
    // non-string/non-number path for Temporal types specifically.)
    class User extends Model {
      static {
        this.attribute("flag", "boolean");
        this.attribute("when", "datetime");
        this.validates("flag", { numericality: true });
        this.validates("when", { numericality: true });
      }
    }
    expect(await new User({ flag: true }).isValid()).toBe(false);
    expect(await new User({ flag: false }).isValid()).toBe(false);
    expect(await new User({ when: "2026-04-29T00:00:00Z" }).isValid()).toBe(false);
  });

  it("rejects plain object values via NumericalityValidator.validateEach directly", async () => {
    // Direct exercise of the non-string/non-number narrowing in isNumber.
    // Going through Model attributes wouldn't work — string-typed attrs
    // cast objects to "[object Object]" before validation, value-typed
    // attrs go through their own cast path. Bypass attribute infra and
    // call the validator with a stub record so a real plain object
    // reaches isNumber.
    const { NumericalityValidator } = await import("./numericality.js");
    const v = new NumericalityValidator({ attributes: ["x"] });
    const errs = new Errors(null);
    const stubRecord = { errors: errs };
    v.validateEach(stubRecord, "x", { not: "a number" });
    expect(errs.get("x")).toHaveLength(1);
    expect(errs.where("x", "not_a_number")).toHaveLength(1);
  });

  it("validates against the raw before-type-cast value (prepareValueForValidation)", async () => {
    // Rails numericality validates what the user typed, not the cast
    // value. In trails, IntegerType.cast returns null for non-numeric
    // strings — so without prepareValueForValidation, 'abc' would read
    // as null and slip past via the allowNil short-circuit. The raw
    // read through readAttributeBeforeTypeCast surfaces the original
    // 'abc' so it's caught as not_a_number.
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    // "abc" can't cast through IntegerType (trails returns null), but
    // the validator should see the raw "abc" via
    // readAttributeBeforeTypeCast and reject it as not_a_number — NOT
    // accidentally pass via the null-then-allow_nil branch.
    const p = new Person({ age: "abc" });
    expect(p.readAttributeBeforeTypeCast("age")).toBe("abc");
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("age")).toContain("is not a number");
  });

  // Removed: two trails-only tests that pinned the now-deleted `validate`
  // override's deviation (typed integer "abc" + allowNil asserted invalid).
  // Rails skips that case (cast-based allow_nil), so the tests no longer
  // describe real behaviour; the converged behaviour is covered by the AR
  // "allow nil works for casted value" port and the "numericality: true"
  // raw-read test above. Renaming them in place would violate the
  // never-reword-test-names rule, so they are dropped rather than relabelled.

  it("isAllowOnlyInteger honors a record-method onlyInteger (Ruby truthiness)", async () => {
    // Rails: allow_only_integer?(record) returns
    // resolve_value(record, options[:only_integer]). A method name
    // like 'strictMode' resolves to record.strictMode().
    class Person extends Model {
      static {
        this.attribute("score", "string");
        this.validates("score", { numericality: { onlyInteger: "strictMode" } });
      }
      strictMode(): boolean {
        return true;
      }
    }
    expect(await new Person({ score: "5" }).isValid()).toBe(true);
    const f = new Person({ score: "5.5" });
    expect(await f.isValid()).toBe(false);
    expect(f.errors.get("score")).toContain("must be an integer");
  });

  it("odd/even truncates float via Math.trunc before checking parity (2.5 → 2, even)", async () => {
    // Rails: value.to_i.even? — truncates toward zero, so 2.5.to_i == 2
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { even: true } });
      }
    }
    expect(await new Person({ score: 2.5 }).isValid()).toBe(true); // trunc(2.5)=2, even
    expect(await new Person({ score: 3.5 }).isValid()).toBe(false); // trunc(3.5)=3, odd
  });

  it("odd/even truncates negative float via Math.trunc (-2.5 → -2, even)", async () => {
    // Ruby: -2.5.to_i == -2 (toward zero), not -3 (Math.floor would give wrong answer)
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { odd: true } });
      }
    }
    expect(await new Person({ score: -3.5 }).isValid()).toBe(true); // trunc(-3.5)=-3, odd
    expect(await new Person({ score: -2.5 }).isValid()).toBe(false); // trunc(-2.5)=-2, even
  });

  it("odd/even truncation: 2.9 is even (truncates to 2, not rounds to 3)", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { even: true } });
      }
    }
    expect(await new Person({ score: 2.9 }).isValid()).toBe(true); // trunc(2.9)=2, even
    expect(await new Person({ score: 3.9 }).isValid()).toBe(false); // trunc(3.9)=3, odd
  });

  it("cameFromUser absent (AM Model) → falls back to readAttributeBeforeTypeCast, catches raw string", async () => {
    // AM's Model has no cameFromUser — prepareValueForValidation degrades to
    // the readAttributeBeforeTypeCast path and still catches bad raw input.
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: "abc" });
    // AM Model does not expose cameFromUser
    expect(typeof (p as any).cameFromUser).toBe("undefined");
    // Validator sees "abc" (raw via readAttributeBeforeTypeCast), reports not_a_number
    expect(await p.isValid()).toBe(false);
    expect(p.errors.get("age")).toContain("is not a number");
  });

  it("cameFromUser false → validates cast value (readAttribute)", () => {
    // Mock: cameFromUser returns false, but cast value (readAttribute) is
    // a valid number — validation should pass.
    class MockRecord {
      errors = { add: vi.fn() };
      cameFromUser(_name: string) {
        return false;
      }
      readAttribute(_name: string) {
        return 42;
      }
      readAttributeBeforeTypeCast(_name: string) {
        return "not-a-number-string";
      }
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "initial", rec as any, "score");
    // Should return the cast value (42), not the raw string
    expect(result).toBe(42);
  });

  it("cameFromUser absent → falls back to readAttributeBeforeTypeCast", () => {
    // Non-AR hosts that don't implement cameFromUser degrade gracefully.
    class MockRecord {
      errors = { add: vi.fn() };
      readAttributeBeforeTypeCast(_name: string) {
        return "raw-value";
      }
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "fallback", rec as any, "score");
    expect(result).toBe("raw-value");
  });

  it("cameFromUser false + no readAttributeBeforeTypeCast → readAttribute fallback", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      cameFromUser(_name: string) {
        return false;
      }
      readAttribute(_name: string) {
        return 99;
      }
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "initial", rec as any, "score");
    expect(result).toBe(99);
  });
});
