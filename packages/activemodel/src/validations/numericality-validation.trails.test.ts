/**
 * Trails-only numericality coverage: the JS-vs-Ruby coercion gaps
 * `Kernel.Float` closes for free, plus the `prepare_value_for_validation`
 * host-shape branches. None of these have a Rails counterpart test, so they
 * live here rather than in `numericality-validation.test.ts` (CLAUDE.md).
 */
import { describe, it, expect, vi } from "vitest";
import { Model, Errors } from "../index.js";
import { NumericalityValidator, prepareValueForValidation } from "./numericality.js";

describe("NumericalityValidator (trails-only)", () => {
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

  it("rejects non-string/non-number values (boolean, Temporal.Instant, plain object)", async () => {
    // Rails Kernel.Float raises TypeError for non-Numeric/non-String
    // input, so is_number? returns false. In JS, Number(true) === 1
    // and Number(<object with valueOf>) can coerce silently — the
    // explicit narrowing in kernelFloat prevents that.
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

  it("rejects plain object values via NumericalityValidator.validateEach directly", () => {
    // Direct exercise of the non-string/non-number narrowing in kernelFloat.
    // Going through Model attributes wouldn't work — string-typed attrs
    // cast objects to "[object Object]" before validation, value-typed
    // attrs go through their own cast path. Bypass attribute infra and
    // call the validator with a stub record so a real plain object
    // reaches the parse pipeline.
    const v = new NumericalityValidator({ attributes: ["x"] });
    const errs = new Errors(null);
    const stubRecord = { errors: errs };
    v.validateEach(stubRecord, "x", { not: "a number" });
    expect(errs.messagesFor("x")).toHaveLength(1);
    expect(errs.where("x", ":not_a_number")).toHaveLength(1);
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
    const p = new Person({ age: "abc" });
    expect(p.readAttributeBeforeTypeCast("age")).toBe("abc");
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("age")).toContain("is not a number");
  });

  it("isAllowOnlyInteger honors a record-method onlyInteger (Ruby truthiness)", async () => {
    // Rails: allow_only_integer?(record) returns
    // resolve_value(record, options[:only_integer]). A Symbol like
    // :strict_mode resolves to record.strictMode().
    class Person extends Model {
      static {
        this.attribute("score", "string");
        this.validates("score", { numericality: { onlyInteger: ":strictMode" } });
      }
      strictMode(): boolean {
        return true;
      }
    }
    expect(await new Person({ score: "5" }).isValid()).toBe(true);
    const f = new Person({ score: "5.5" });
    expect(await f.isValid()).toBe(false);
    expect(f.errors.messagesFor("score")).toContain("must be an integer");
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
    expect(typeof (p as unknown as { cameFromUser?: unknown }).cameFromUser).toBe("undefined");
    // Validator sees "abc" (raw via readAttributeBeforeTypeCast), reports not_a_number
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("age")).toContain("is not a number");
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
    const result = prepareValueForValidation.call(undefined, "initial", rec as never, "score");
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
    const result = prepareValueForValidation.call(undefined, "fallback", rec as never, "score");
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
    const result = prepareValueForValidation.call(undefined, "initial", rec as never, "score");
    expect(result).toBe(99);
  });
});
