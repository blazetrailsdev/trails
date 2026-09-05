/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, vi } from "vitest";
import { Model, Errors } from "../index.js";
import { NumericalityValidator, prepareValueForValidation } from "./numericality.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { include } from "@blazetrails/activesupport";

describe("NumericalityValidator (trails-only)", () => {
  it("rejects blank and whitespace-only strings", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    interface User extends Attributes {}

    expect(await new User({ name: "" }).isValid()).toBe(false);
    expect(await new User({ name: "   " }).isValid()).toBe(false);
  });

  it("rejects JS binary and octal literal strings", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    interface User extends Attributes {}

    expect(await new User({ name: "0b10" }).isValid()).toBe(false);
    expect(await new User({ name: "0o10" }).isValid()).toBe(false);
    expect(await new User({ name: "  0b10" }).isValid()).toBe(false);
    expect(await new User({ name: "+0o10" }).isValid()).toBe(false);
  });

  it("rejects hexadecimal literal strings HEXADECIMAL_REGEX anchors on", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { numericality: true });
      }
    }
    interface User extends Attributes {}

    expect(await new User({ name: "0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "+0x10" }).isValid()).toBe(false);
    expect(await new User({ name: "  0x10" }).isValid()).toBe(true);
  });

  it("rejects non-string/non-number values (boolean, Temporal.Instant, plain object)", async () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("flag", "boolean");
        this.attribute("when", "datetime");
        this.validates("flag", { numericality: true });
        this.validates("when", { numericality: true });
      }
    }
    interface User extends Attributes {}

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
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = true;
      scoreBeforeTypeCast = "abc";
      readAttribute(_name: string) {
        return 0;
      }
    }
    const rec = new MockRecord();
    expect(
      prepareValueForValidation.call(
        new NumericalityValidator({ attributes: ["score"] }),
        0,
        rec as never,
        "score",
      ),
    ).toBe("abc");
  });

  it("returns the cast value when the attribute was changed in place", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = true;
      scoreBeforeTypeCast = "abc";
      attributeChangedInPlace(_name: string) {
        return true;
      }
      readAttribute(_name: string) {
        return 0;
      }
    }
    const rec = new MockRecord();
    expect(
      prepareValueForValidation.call(
        new NumericalityValidator({ attributes: ["score"] }),
        10,
        rec as never,
        "score",
      ),
    ).toBe(10);
  });

  it("dispatches the changed-in-place guard through the receiver, so a subclass override wins", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreCameFromUser = true;
      scoreBeforeTypeCast = "abc";
      attributeChangedInPlace(_name: string) {
        return true;
      }
    }
    class NeverChangedInPlaceValidator extends NumericalityValidator {
      override isRecordAttributeChangedInPlace = (): boolean => false;
    }
    const validator = new NeverChangedInPlaceValidator({ attributes: ["score"] });
    const rec = new MockRecord();
    expect(prepareValueForValidation.call(validator, 10, rec as never, "score")).toBe("abc");
  });

  it("isAllowOnlyInteger honors a record-method onlyInteger (Ruby truthiness)", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("score", "string");
        this.validates("score", { numericality: { onlyInteger: ":strictMode" } });
      }
      strictMode(): boolean {
        return true;
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ score: "5" }).isValid()).toBe(true);
    const f = new Person({ score: "5.5" });
    expect(await f.isValid()).toBe(false);
    expect(f.errors.messagesFor("score")).toContain("must be an integer");
  });

  it("odd/even truncates float via Math.trunc before checking parity (2.5 → 2, even)", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("score", "float");
        this.validates("score", { numericality: { even: true } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ score: 2.5 }).isValid()).toBe(true);
    expect(await new Person({ score: 3.5 }).isValid()).toBe(false);
  });

  it("odd/even truncates negative float via Math.trunc (-2.5 → -2, even)", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("score", "float");
        this.validates("score", { numericality: { odd: true } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ score: -3.5 }).isValid()).toBe(true);
    expect(await new Person({ score: -2.5 }).isValid()).toBe(false);
  });

  it("odd/even truncation: 2.9 is even (truncates to 2, not rounds to 3)", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("score", "float");
        this.validates("score", { numericality: { even: true } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ score: 2.9 }).isValid()).toBe(true);
    expect(await new Person({ score: 3.9 }).isValid()).toBe(false);
  });

  it("cameFromUser absent (AM Model) → validates the cast value", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
        this.validates("age", { numericality: true });
      }
    }
    interface Person extends Attributes {}

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
    const result = prepareValueForValidation.call(
      new NumericalityValidator({ attributes: ["score"] }),
      "initial",
      rec as never,
      "score",
    );
    expect(result).toBe(42);
  });

  it("cameFromUser absent → falls back to readAttributeBeforeTypeCast", () => {
    class MockRecord {
      errors = { add: vi.fn() };
      scoreBeforeTypeCast = "raw-value";
    }
    const rec = new MockRecord();
    const result = prepareValueForValidation.call(
      new NumericalityValidator({ attributes: ["score"] }),
      "fallback",
      rec as never,
      "score",
    );
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
    const result = prepareValueForValidation.call(
      new NumericalityValidator({ attributes: ["score"] }),
      "initial",
      rec as never,
      "score",
    );
    expect(result).toBe(99);
  });
});
