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

  it("rejects hexadecimal literal strings HEXADECIMAL_REGEX anchors on", async () => {
    // Rails parse_as_number's elsif chain skips Kernel.Float when
    // is_hexadecimal_literal?, so "0x10" is not-a-number. The regex is
    // \A-anchored, so a leading space defeats it and Kernel.Float — which
    // strips whitespace and DOES read hex (Float("  0x10") is 16.0 on
    // MRI 3.3) — answers 16 instead.
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    expect(await new User({ name: "0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "+0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "  0x10" }).isValid()).toBe(true);
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
    const v = new NumericalityValidator({ attributes: ["x"] });
    const errs = new Errors(null);
    const stubRecord = { errors: errs };
    v.validateEach(stubRecord, "x", { not: "a number" });
    expect(errs.messagesFor("x")).toHaveLength(1);
    expect(errs.where("x", ":not_a_number")).toHaveLength(1);
  });

  it("validates against the raw before-type-cast value (prepareValueForValidation)", () => {
    // numericality.rb:127-132 — a record answering `<attr>_came_from_user?`
    // truthily is validated on `<attr>_before_type_cast`, so what the user
    // typed is what gets checked.
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = true;
      scoreBeforeTypeCast = "abc";
      readAttribute(_name: string) {
        return 0;
      }
    }
    const rec = new MockRecord();
    expect(prepareValueForValidation.call(undefined, 0, rec as never, "score")).toBe("abc");
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
    expect(await new Person({ score: 2.5 }).isValid()).toBe(true);
    expect(await new Person({ score: 3.5 }).isValid()).toBe(false);
  });

  it("odd/even truncates negative float via Math.trunc (-2.5 → -2, even)", async () => {
    // Ruby: -2.5.to_i == -2 (toward zero), not -3 (Math.floor would give wrong answer)
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { odd: true } });
      }
    }
    expect(await new Person({ score: -3.5 }).isValid()).toBe(true);
    expect(await new Person({ score: -2.5 }).isValid()).toBe(false);
  });

  it("odd/even truncation: 2.9 is even (truncates to 2, not rounds to 3)", async () => {
    class Person extends Model {
      static {
        this.attribute("score", "float");
        this.validates("score", { numericality: { even: true } });
      }
    }
    expect(await new Person({ score: 2.9 }).isValid()).toBe(true);
    expect(await new Person({ score: 3.9 }).isValid()).toBe(false);
  });

  it("cameFromUser absent (AM Model) → validates the cast value", async () => {
    // A plain ActiveModel model declares neither `_came_from_user?` nor
    // `_before_type_cast` (both are ActiveRecord's, before_type_cast.rb:32-33),
    // so prepareValueForValidation takes the `else` arm, finds nothing, and
    // returns `value`. Ruby's `"abc".to_i` is 0, and so is trails' integer
    // cast, so the record is valid — exactly as it is in Rails.
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    const p = new Person({ age: "abc" });
    expect("ageCameFromUser" in (p as unknown as object)).toBe(false);
    expect((p as unknown as { age: unknown }).age).toBe(0);
    expect(await p.isValid()).toBe(true);
  });

  it("cameFromUser false → validates cast value (readAttribute)", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = false;
      scoreBeforeTypeCast = "not-a-number-string";
      readAttribute(_name: string) {
        return 42;
      }
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "initial", rec as never, "score");
    expect(result).toBe(42);
  });

  it("cameFromUser absent → falls back to readAttributeBeforeTypeCast", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreBeforeTypeCast = "raw-value";
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "fallback", rec as never, "score");
    expect(result).toBe("raw-value");
  });

  it("cameFromUser false + no readAttributeBeforeTypeCast → readAttribute fallback", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = false;
      readAttribute(_name: string) {
        return 99;
      }
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(undefined, "initial", rec as never, "score");
    expect(result).toBe(99);
  });
});
