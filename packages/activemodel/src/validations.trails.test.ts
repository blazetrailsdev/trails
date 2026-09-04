/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "./index.js";
import { Errors } from "./errors.js";
import { ModelName } from "./naming.js";
import { humanAttributeName } from "./translation.js";
import { Validations } from "./validations.js";
import { resetI18n } from "./test-helpers/i18n.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { Range } from "@blazetrails/ruby-compat";

describe("ValidationsTest (trails)", () => {
  describe("presence", () => {
    class Article extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    interface Article extends Attributes {}

    it("rejects null", async () => {
      const a = new Article();
      expect(await a.isValid()).toBe(false);
      expect(a.errors.messagesFor("title")).toContain("can't be blank");
    });

    it("rejects empty string", async () => {
      const a = new Article({ title: "" });
      expect(await a.isValid()).toBe(false);
    });

    it("rejects whitespace-only string", async () => {
      const a = new Article({ title: "   " });
      expect(await a.isValid()).toBe(false);
    });

    it("accepts a real value", async () => {
      const a = new Article({ title: "Hello" });
      expect(await a.isValid()).toBe(true);
    });
  });

  describe("absence", () => {
    class Blank extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { absence: true });
      }
    }
    interface Blank extends Attributes {}

    it("accepts null", async () => {
      expect(await new Blank().isValid()).toBe(true);
    });

    it("accepts empty string", async () => {
      expect(await new Blank({ name: "" }).isValid()).toBe(true);
    });

    it("rejects a value", async () => {
      const b = new Blank({ name: "dean" });
      expect(await b.isValid()).toBe(false);
      expect(b.errors.messagesFor("name")).toContain("must be blank");
    });
  });

  describe("length", () => {
    class WithLength extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", {
          length: { minimum: 3, maximum: 10 },
        });
      }
    }
    interface WithLength extends Attributes {}

    it("validates length of using minimum", async () => {
      const w = new WithLength({ name: "ab" });
      expect(await w.isValid()).toBe(false);
      expect(w.errors.messagesFor("name")[0]).toMatch(/is too short/);
    });

    it("validates length of using maximum", async () => {
      const w = new WithLength({ name: "abcdefghijk" });
      expect(await w.isValid()).toBe(false);
      expect(w.errors.messagesFor("name")[0]).toMatch(/is too long/);
    });

    it("validates length of using within", async () => {
      expect(await new WithLength({ name: "dean" }).isValid()).toBe(true);
    });

    it("validates length of using is", async () => {
      class Exact extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("code", "string");
          this.validates("code", { length: { is: 4 } });
        }
      }
      interface Exact extends Attributes {}

      expect(await new Exact({ code: "1234" }).isValid()).toBe(true);
      expect(await new Exact({ code: "123" }).isValid()).toBe(false);
      expect(await new Exact({ code: "12345" }).isValid()).toBe(false);
    });

    it("validates with in (range)", async () => {
      class WithRange extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { length: { in: new Range(2, 5) } });
        }
      }
      interface WithRange extends Attributes {}

      expect(await new WithRange({ name: "a" }).isValid()).toBe(false);
      expect(await new WithRange({ name: "ab" }).isValid()).toBe(true);
      expect(await new WithRange({ name: "abcde" }).isValid()).toBe(true);
      expect(await new WithRange({ name: "abcdef" }).isValid()).toBe(false);
    });

    it("skips null values (null has no length)", async () => {
      expect(await new WithLength({}).isValid()).toBe(false);
    });
  });

  describe("numericality", () => {
    class Numeric extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("value", "string");
        this.validates("value", { numericality: true });
      }
    }
    interface Numeric extends Attributes {}

    it("default validates numericality of", async () => {
      expect(await new Numeric({ value: "42" }).isValid()).toBe(true);
      expect(await new Numeric({ value: "3.14" }).isValid()).toBe(true);
    });

    it("rejects non-numeric strings", async () => {
      const n = new Numeric({ value: "not a number" });
      expect(await n.isValid()).toBe(false);
      expect(n.errors.messagesFor("value")).toContain("is not a number");
    });

    it("validates numericality of with nil allowed", async () => {
      class NilOk extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "string");
          this.validates("value", { numericality: { allowNil: true } });
        }
      }
      interface NilOk extends Attributes {}

      expect(await new NilOk({}).isValid()).toBe(true);
    });

    it("validates numericality of only integers", async () => {
      class IntOnly extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "string");
          this.validates("value", { numericality: { onlyInteger: true } });
        }
      }
      interface IntOnly extends Attributes {}

      expect(await new IntOnly({ value: "42" }).isValid()).toBe(true);
      expect(await new IntOnly({ value: "3.14" }).isValid()).toBe(false);
    });

    it("validates numericality with greater_than", async () => {
      class GreaterThan extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThan: 5 } });
        }
      }
      interface GreaterThan extends Attributes {}

      expect(await new GreaterThan({ value: 6 }).isValid()).toBe(true);
      expect(await new GreaterThan({ value: 5 }).isValid()).toBe(false);
    });

    it("validates numericality with greater_than_or_equal_to", async () => {
      class GreaterThanOrEqual extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { greaterThanOrEqualTo: 5 } });
        }
      }
      interface GreaterThanOrEqual extends Attributes {}

      expect(await new GreaterThanOrEqual({ value: 5 }).isValid()).toBe(true);
      expect(await new GreaterThanOrEqual({ value: 4 }).isValid()).toBe(false);
    });

    it("validates numericality with equal_to", async () => {
      class EqualTo extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { equalTo: 5 } });
        }
      }
      interface EqualTo extends Attributes {}

      expect(await new EqualTo({ value: 5 }).isValid()).toBe(true);
      expect(await new EqualTo({ value: 4 }).isValid()).toBe(false);
    });

    it("validates numericality with less_than", async () => {
      class LessThan extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { lessThan: 5 } });
        }
      }
      interface LessThan extends Attributes {}

      expect(await new LessThan({ value: 4 }).isValid()).toBe(true);
      expect(await new LessThan({ value: 5 }).isValid()).toBe(false);
    });

    it("validates numericality with less_than_or_equal_to", async () => {
      class LessThanOrEqual extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { lessThanOrEqualTo: 5 } });
        }
      }
      interface LessThanOrEqual extends Attributes {}

      expect(await new LessThanOrEqual({ value: 5 }).isValid()).toBe(true);
      expect(await new LessThanOrEqual({ value: 6 }).isValid()).toBe(false);
    });

    it("validates numericality with odd", async () => {
      class Odd extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { odd: true } });
        }
      }
      interface Odd extends Attributes {}

      expect(await new Odd({ value: 3 }).isValid()).toBe(true);
      expect(await new Odd({ value: 4 }).isValid()).toBe(false);
    });

    it("validates numericality with even", async () => {
      class Even extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "integer");
          this.validates("value", { numericality: { even: true } });
        }
      }
      interface Even extends Attributes {}

      expect(await new Even({ value: 4 }).isValid()).toBe(true);
      expect(await new Even({ value: 3 }).isValid()).toBe(false);
    });
  });

  describe("inclusion and exclusion", () => {
    class Colorful extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("color", "string");
        this.validates("color", {
          inclusion: { in: ["red", "green", "blue"] },
          exclusion: { in: ["black"] },
        });
      }
    }
    interface Colorful extends Attributes {}

    it("accepts included and non-excluded values", async () => {
      expect(await new Colorful({ color: "red" }).isValid()).toBe(true);
    });

    it("rejects values not in inclusion list", async () => {
      const c = new Colorful({ color: "yellow" });
      expect(await c.isValid()).toBe(false);
      expect(c.errors.messagesFor("color")).toContain("is not included in the list");
    });

    it("rejects values in exclusion list", async () => {
      const c = new Colorful({ color: "black" });
      expect(await c.isValid()).toBe(false);
      expect(c.errors.messagesFor("color")).toContain("is reserved");
    });
  });

  describe("format", () => {
    class EmailUser extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("email", "string");
        this.validates("email", {
          format: { with: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, multiline: true },
        });
      }
    }
    interface EmailUser extends Attributes {}

    it("accepts valid email", async () => {
      expect(await new EmailUser({ email: "user@example.com" }).isValid()).toBe(true);
    });

    it("rejects invalid email", async () => {
      const u = new EmailUser({ email: "invalid" });
      expect(await u.isValid()).toBe(false);
      expect(u.errors.messagesFor("email")).toContain("is invalid");
    });
  });

  describe("confirmation", () => {
    class Signup extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("password", "string");
        this.attribute("passwordConfirmation", "string");
        this.validates("password", { confirmation: true });
      }
    }
    interface Signup extends Attributes {}

    it("accepts matching password and confirmation", async () => {
      expect(
        await new Signup({ password: "secret", passwordConfirmation: "secret" }).isValid(),
      ).toBe(true);
    });

    it("rejects mismatched password and confirmation", async () => {
      const s = new Signup({ password: "secret", passwordConfirmation: "wrong" });
      expect(await s.isValid()).toBe(false);
      expect(s.errors.messagesFor("passwordConfirmation")).toContain("doesn't match Password");
    });
  });

  describe("uniqueness", () => {
    class UniqueUser extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static existingNames = new Set<string>();

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }

      override async isValid(): Promise<boolean> {
        const valid = await super.isValid();
        if (!valid) return false;
        const name = this._readAttribute("name") as string;
        if (UniqueUser.existingNames.has(name)) {
          this.errors.add("name", "has already been taken");
          return false;
        }
        UniqueUser.existingNames.add(name);
        return true;
      }
    }
    interface UniqueUser extends Attributes {}

    it("accepts unique names", async () => {
      UniqueUser.existingNames.clear();
      expect(await new UniqueUser({ name: "alice" }).isValid()).toBe(true);
      expect(await new UniqueUser({ name: "bob" }).isValid()).toBe(true);
    });

    it("rejects duplicate names", async () => {
      UniqueUser.existingNames.clear();
      const first = new UniqueUser({ name: "alice" });
      const second = new UniqueUser({ name: "alice" });
      expect(await first.isValid()).toBe(true);
      expect(await second.isValid()).toBe(false);
      expect(second.errors.messagesFor("name")).toContain("has already been taken");
    });
  });

  describe("type-based validations", () => {
    class TypedModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
        this.attribute("email", "string");
        this.validates("age", { presence: true, numericality: { onlyInteger: true } });
        this.validates("email", { presence: true });
      }
    }
    interface TypedModel extends Attributes {}

    it("accepts valid types", async () => {
      expect(await new TypedModel({ age: 30, email: "test@example.com" }).isValid()).toBe(true);
    });

    it("rejects invalid types", async () => {
      const m = new TypedModel({ age: null, email: "" } as any);
      expect(await m.isValid()).toBe(false);
      expect(m.errors.messagesFor("age").length).toBeGreaterThan(0);
      expect(m.errors.messagesFor("email").length).toBeGreaterThan(0);
    });
  });

  it("validates an undeclared getter via the send default", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("first", "string");
      }
      get fullName(): string {
        return (this._readAttribute("first") as string) ?? "";
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["fullName"], (record, attr, value) => {
      if (!value) record.errors.add(attr, "gotcha");
    });
    const present = new Person({ first: "Al" });
    await present.isValid();
    expect(present.errors.messagesFor("fullName")).not.toContain("gotcha");
    const blank = new Person({ first: "" });
    await blank.isValid();
    expect(blank.errors.messagesFor("fullName")).toContain("gotcha");
  });

  it("read_attribute_for_validation returns undefined for a present reader that returns undefined", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      get optional(): string | undefined {
        return undefined;
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Al" });
    expect(
      (
        p as unknown as { readAttributeForValidation(a: string): unknown }
      ).readAttributeForValidation("optional"),
    ).toBeUndefined();
  });

  it("read_attribute_for_validation raises NoMethodError-style for a missing reader", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Al" });
    expect(() =>
      (
        p as unknown as { readAttributeForValidation(a: string): unknown }
      ).readAttributeForValidation("nope"),
    ).toThrow(/undefined method 'nope'/);
  });

  it("validates format of with multiline regexp should raise error", () => {
    expect(() => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { format: { with: /^test$/m } });
        }
      }
      interface Person extends Attributes {}
    }).toThrow(/multiline/i);
  });

  it("validates format of without any regexp should raise error", () => {
    expect(() => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { format: {} });
        }
      }
      interface Person extends Attributes {}
    }).toThrow(/with.*without/i);
  });

  describe("return-shape parity", () => {
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    interface Topic extends Attributes {}

    it("validate returns boolean (Rails alias_method :validate, :valid?)", async () => {
      expect(await new Topic({ title: "ok" }).validate()).toBe(true);
      expect(await new Topic({}).validate()).toBe(false);
    });

    it("invalid? accepts a context argument", async () => {
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      interface Scoped extends Attributes {}

      const s = new Scoped({});
      expect(await s.isInvalid()).toBe(false);
      expect(await s.isInvalid("create")).toBe(true);
    });

    it("validate! returns true and raises otherwise (never returns false)", async () => {
      expect(await new Topic({ title: "ok" }).validateBang()).toBe(true);
      await expect(new Topic({}).validateBang()).rejects.toThrow(/Validation failed/);
    });

    it("validate! forwards context to valid?", async () => {
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      interface Scoped extends Attributes {}

      expect(await new Scoped({}).validateBang()).toBe(true);
      await expect(new Scoped({}).validateBang("create")).rejects.toThrow(/Validation failed/);
    });

    it("valid? accepts an array context that matches :on-registered validators", async () => {
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("title", "string");
          this.validates("name", { presence: true, on: "create" });
          this.validates("title", { presence: true, on: ["publish"] });
        }
      }
      interface Scoped extends Attributes {}

      const a = new Scoped({});
      expect(await a.isValid("create")).toBe(false);
      expect(a.errors.attributeNames).toEqual(["name"]);

      const b = new Scoped({});
      expect(await b.isValid(["create", "publish"])).toBe(false);
      expect(b.errors.attributeNames.sort()).toEqual(["name", "title"]);

      const c = new Scoped({});
      expect(await c.isValid(["publish"])).toBe(false);
      expect(c.errors.attributeNames).toEqual(["title"]);
    });

    it("on: [array] validator fires when current context is a single symbol in the set", async () => {
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: ["create", "publish"] });
        }
      }
      interface Scoped extends Attributes {}

      expect(await new Scoped({}).isValid("create")).toBe(false);
      expect(await new Scoped({}).isValid("publish")).toBe(false);
      expect(await new Scoped({}).isValid("unrelated")).toBe(true);
    });

    it("validationContext round-trips array contexts while a validation is in flight", async () => {
      const captured: Array<string | string[] | null> = [];
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validate((record: InstanceType<typeof Scoped>) => {
            captured.push(record.validationContext);
          });
        }
      }
      interface Scoped extends Attributes {}

      await new Scoped({}).isValid(["create", "publish"]);
      expect(captured).toEqual([["create", "publish"]]);
    });

    it("valid?(null) clears the context (Rails sets it to nil on entry)", async () => {
      const captured: Array<string | string[] | null> = [];
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validate((r: InstanceType<typeof Scoped>) => {
            captured.push(r.validationContext);
          });
        }
      }
      interface Scoped extends Attributes {}

      const m = new Scoped({});
      await m.isValid("previous");
      await m.isValid(null);
      expect(captured).toEqual(["previous", null]);
    });

    it("valid? restores previous context in ensure/finally even on failure", async () => {
      class Scoped extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Scoped extends Attributes {}

      const m = new Scoped({});
      const before = m.validationContext;
      await m.isValid("custom");
      expect(m.validationContext).toBe(before);
    });
  });

  describe("ValidationError + freeze (Rails fidelity)", () => {
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    interface Topic extends Attributes {}

    it("ValidationError message comes from I18n :model_invalid", async () => {
      await expect(new Topic({}).validateBang()).rejects.toThrow(
        /^Validation failed: Title can't be blank$/,
      );
    });

    it("ValidationError message picks up per-scope override", async () => {
      const { I18n } = await import("./i18n.js");
      I18n.backend().storeTranslations("en", {
        activemodel: {
          errors: {
            messages: { model_invalid: "Nope: %{errors}" },
          },
        },
      });
      try {
        await expect(new Topic({}).validateBang()).rejects.toThrow(/^Nope: /);
      } finally {
        resetI18n();
      }
    });

    it("freeze locks the object and returns self", () => {
      const t = new Topic({ title: "ok" });
      expect(t.freeze()).toBe(t);
      expect(Object.isFrozen(t)).toBe(true);
    });

    it("freeze preserves errors/validationContext access (Rails pre-touch)", () => {
      const t = new Topic({ title: "ok" });
      t.freeze();
      expect(t.errors).toBeDefined();
      expect(t.validationContext).toBe(null);
    });

    it("contextForValidation is a live view of validationContext", () => {
      const t = new Topic({ title: "ok" });
      const vc = t.contextForValidation();
      vc.context = "create";
      expect(t.validationContext).toBe("create");
      expect(t.contextForValidation()).toBe(vc);
    });

    it("contextForValidation is callable on a frozen model", () => {
      const t = new Topic({ title: "ok" });
      t.freeze();
      expect(() => t.contextForValidation()).not.toThrow();
    });
  });

  describe("_validators hash-of-arrays (Rails fidelity)", () => {
    it("validatorsOn is O(1) per-attribute lookup", () => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.validates("name", { presence: true });
          this.validates("age", { numericality: true });
        }
      }
      interface Person extends Attributes {}

      expect(Person.validatorsOn("name")).toHaveLength(1);
      expect(Person.validatorsOn("age")).toHaveLength(1);
      expect(Person.validatorsOn("nonexistent")).toEqual([]);
    });

    it("validators() returns a uniq flat list across all attribute buckets", () => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validatesEach(["name", "email"], () => {});
        }
      }
      interface Person extends Attributes {}

      expect(Person.validators()).toHaveLength(1);
      expect(Person.validatorsOn("name")).toHaveLength(1);
      expect(Person.validatorsOn("email")).toHaveLength(1);
      expect(Person.validatorsOn("name")[0]).toBe(Person.validatorsOn("email")[0]);
    });

    it("inheritance is copy-on-first-write (subclass sees parent writes made before its own first write)", () => {
      class Base extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Base extends Attributes {}

      class Child extends Base {}
      expect(Child.validatorsOn("name")).toHaveLength(1);
      Base.validates("name", { length: { minimum: 2 } });
      expect(Child.validatorsOn("name")).toHaveLength(2);
      Child.validates("name", { length: { maximum: 10 } });
      Base.validates("name", { format: { with: /x/ } });
      expect(Child.validatorsOn("name")).toHaveLength(3);
      expect(Base.validatorsOn("name")).toHaveLength(3);
      expect(Child.validatorsOn("name")).not.toContain(Base.validatorsOn("name")[2]);
    });

    it("subclass inherits validators but its changes don't leak up", () => {
      class Base extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Base extends Attributes {}

      class Child extends Base {}
      expect(Child.validatorsOn("name")).toHaveLength(1);
      Child.validates("name", { length: { minimum: 2 } });
      expect(Child.validatorsOn("name")).toHaveLength(2);
      expect(Base.validatorsOn("name")).toHaveLength(1);
    });

    it("clearValidators! empties the map", () => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Person extends Attributes {}

      expect(Person.validators()).toHaveLength(1);
      Person.clearValidatorsBang();
      expect(Person.validators()).toEqual([]);
      expect(Person.validatorsOn("name")).toEqual([]);
    });

    it("validatorsOn returns a fresh array (no state-mutating reads)", () => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Person extends Attributes {}

      Person.validatorsOn("never_registered");
      expect(Array.from(Person._validators.keys())).not.toContain("never_registered");

      const a = Person.validatorsOn("name");
      a.length = 0;
      expect(Person.validatorsOn("name")).toHaveLength(1);

      expect(Person.validatorsOn("name")).not.toBe(Person.validatorsOn("name"));
    });
  });

  describe("validatesEach", () => {
    it("validates each", async () => {
      class Payment extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("price", "integer");
          this.attribute("discount", "integer");
          this.validatesEach(["price", "discount"], (record, attr, value) => {
            if (typeof value === "number" && value < 0) {
              record.errors.add(attr, ":invalid", { message: "must be non-negative" });
            }
          });
        }
      }
      interface Payment extends Attributes {}

      const p = new Payment({ price: -5, discount: 10 });
      expect(await p.isValid()).toBe(false);
      expect(p.errors.fullMessages).toContain("Price must be non-negative");

      const p2 = new Payment({ price: 5, discount: -3 });
      expect(await p2.isValid()).toBe(false);
      expect(p2.errors.fullMessages).toContain("Discount must be non-negative");

      const p3 = new Payment({ price: 5, discount: 10 });
      expect(await p3.isValid()).toBe(true);
    });

    it("supports conditional options", async () => {
      class Payment extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("price", "integer");
          this.attribute("discount", "integer");
          this.validatesEach(
            ["price", "discount"],
            (record, attr, value) => {
              if (typeof value === "number" && value < 0) {
                record.errors.add(attr, ":invalid", { message: "must be non-negative" });
              }
            },
            {
              if: (record) =>
                (record as unknown as { _readAttribute(a: string): unknown })._readAttribute(
                  "price",
                ) !== null,
            },
          );
        }
      }
      interface Payment extends Attributes {}

      const p = new Payment({ price: null, discount: -3 });
      expect(await p.isValid()).toBe(true);
    });
  });

  describe("validatesWith", () => {
    it("validation with class that adds errors", async () => {
      class EvenValidator {
        validate(record: any) {
          const val = record._readAttribute("count");
          if (typeof val === "number" && val % 2 !== 0) {
            record.errors.add("count", ":invalid", { message: "must be even" });
          }
        }
      }

      class Item extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("count", "integer");
          this.validatesWith(EvenValidator);
        }
      }

      interface Item extends Attributes {}

      const item = new Item({ count: 3 });
      expect(await item.isValid()).toBe(false);
      expect(item.errors.fullMessages).toContain("Count must be even");

      const item2 = new Item({ count: 4 });
      expect(await item2.isValid()).toBe(true);
    });

    it("passes all configuration options to the validator class", async () => {
      class ThresholdValidator {
        threshold: number;
        constructor(options: any = {}) {
          this.threshold = options.threshold ?? 10;
        }
        validate(record: any) {
          const val = record._readAttribute("score");
          if (typeof val === "number" && val < this.threshold) {
            record.errors.add("score", ":invalid", {
              message: `must be at least ${this.threshold}`,
            });
          }
        }
      }

      class Game extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("score", "integer");
          this.validatesWith(ThresholdValidator, { threshold: 50 });
        }
      }

      interface Game extends Attributes {}

      const g = new Game({ score: 30 });
      expect(await g.isValid()).toBe(false);
      expect(g.errors.fullMessages).toContain("Score must be at least 50");

      const g2 = new Game({ score: 60 });
      expect(await g2.isValid()).toBe(true);
    });

    it("supports conditional options", async () => {
      class AlwaysInvalidValidator {
        validate(record: any) {
          record.errors.add("base", ":invalid", { message: "always invalid" });
        }
      }

      class Widget extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("active", "boolean");
          this.validatesWith(AlwaysInvalidValidator, {
            if: (r: any) => r._readAttribute("active") === true,
          });
        }
      }

      interface Widget extends Attributes {}

      const w = new Widget({ active: false });
      expect(await w.isValid()).toBe(true);

      const w2 = new Widget({ active: true });
      expect(await w2.isValid()).toBe(false);
    });
  });
  describe("Validations", () => {
    describe("presence", () => {
      class Article extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("title", "string");
          this.validates("title", { presence: true });
        }
      }
      interface Article extends Attributes {}

      it("rejects null", async () => {
        const a = new Article();
        expect(await a.isValid()).toBe(false);
        expect(a.errors.messagesFor("title")).toContain("can't be blank");
      });

      it("rejects empty string", async () => {
        const a = new Article({ title: "" });
        expect(await a.isValid()).toBe(false);
      });

      it("rejects whitespace-only string", async () => {
        const a = new Article({ title: "   " });
        expect(await a.isValid()).toBe(false);
      });

      it("accepts a real value", async () => {
        const a = new Article({ title: "Hello" });
        expect(await a.isValid()).toBe(true);
      });
    });

    describe("absence", () => {
      class Blank extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }
      interface Blank extends Attributes {}

      it("accepts null", async () => {
        expect(await new Blank().isValid()).toBe(true);
      });

      it("accepts empty string", async () => {
        expect(await new Blank({ name: "" }).isValid()).toBe(true);
      });

      it("rejects a value", async () => {
        const b = new Blank({ name: "dean" });
        expect(await b.isValid()).toBe(false);
        expect(b.errors.messagesFor("name")).toContain("must be blank");
      });
    });

    describe("length", () => {
      class WithLength extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", {
            length: { minimum: 3, maximum: 10 },
          });
        }
      }
      interface WithLength extends Attributes {}

      it("validates length of using minimum", async () => {
        const w = new WithLength({ name: "ab" });
        expect(await w.isValid()).toBe(false);
        expect(w.errors.messagesFor("name")[0]).toMatch(/is too short/);
      });

      it("validates length of using maximum", async () => {
        const w = new WithLength({ name: "abcdefghijk" });
        expect(await w.isValid()).toBe(false);
        expect(w.errors.messagesFor("name")[0]).toMatch(/is too long/);
      });

      it("validates length of using within", async () => {
        expect(await new WithLength({ name: "dean" }).isValid()).toBe(true);
      });

      it("validates length of using is", async () => {
        class Exact extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("code", "string");
            this.validates("code", { length: { is: 4 } });
          }
        }
        interface Exact extends Attributes {}

        expect(await new Exact({ code: "1234" }).isValid()).toBe(true);
        expect(await new Exact({ code: "123" }).isValid()).toBe(false);
        expect(await new Exact({ code: "12345" }).isValid()).toBe(false);
      });

      it("validates with in (range)", async () => {
        class WithRange extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("name", "string");
            this.validates("name", { length: { in: new Range(2, 5) } });
          }
        }
        interface WithRange extends Attributes {}

        expect(await new WithRange({ name: "a" }).isValid()).toBe(false);
        expect(await new WithRange({ name: "ab" }).isValid()).toBe(true);
        expect(await new WithRange({ name: "abcde" }).isValid()).toBe(true);
        expect(await new WithRange({ name: "abcdef" }).isValid()).toBe(false);
      });

      it("skips null values (null has no length)", async () => {
        expect(await new WithLength({}).isValid()).toBe(false);
      });
    });

    describe("numericality", () => {
      class Numeric extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("value", "string");
          this.validates("value", { numericality: true });
        }
      }
      interface Numeric extends Attributes {}

      it("default validates numericality of", async () => {
        expect(await new Numeric({ value: "42" }).isValid()).toBe(true);
        expect(await new Numeric({ value: "3.14" }).isValid()).toBe(true);
      });

      it("rejects non-numeric strings", async () => {
        const n = new Numeric({ value: "not a number" });
        expect(await n.isValid()).toBe(false);
        expect(n.errors.messagesFor("value")).toContain("is not a number");
      });

      it("validates numericality of with nil allowed", async () => {
        class NilOk extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("count", "string");
            this.validates("count", { numericality: { allowNil: true } });
          }
        }
        interface NilOk extends Attributes {}

        expect(await new NilOk({}).isValid()).toBe(true);
      });

      it("validates numericality of with integer only", async () => {
        class IntOnly extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("count", "string");
            this.validates("count", { numericality: { onlyInteger: true } });
          }
        }
        interface IntOnly extends Attributes {}

        expect(await new IntOnly({ count: "5" }).isValid()).toBe(true);
        const f = new IntOnly({ count: "5.5" });
        expect(await f.isValid()).toBe(false);
        expect(f.errors.messagesFor("count")).toContain("must be an integer");
      });

      it("validates numericality with greater than", async () => {
        class GT extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("age", "integer");
            this.validates("age", { numericality: { greaterThan: 0 } });
          }
        }
        interface GT extends Attributes {}

        expect(await new GT({ age: 1 }).isValid()).toBe(true);
        expect(await new GT({ age: 0 }).isValid()).toBe(false);
      });

      it("validates numericality with less than", async () => {
        class LT extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("rating", "integer");
            this.validates("rating", { numericality: { lessThan: 10 } });
          }
        }
        interface LT extends Attributes {}

        expect(await new LT({ rating: 9 }).isValid()).toBe(true);
        expect(await new LT({ rating: 10 }).isValid()).toBe(false);
      });

      it("validates numericality with odd", async () => {
        class Odd extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("n", "integer");
            this.validates("n", { numericality: { odd: true } });
          }
        }
        interface Odd extends Attributes {}

        expect(await new Odd({ n: 3 }).isValid()).toBe(true);
        expect(await new Odd({ n: 4 }).isValid()).toBe(false);
      });

      it("validates numericality with even", async () => {
        class Even extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("n", "integer");
            this.validates("n", { numericality: { even: true } });
          }
        }
        interface Even extends Attributes {}

        expect(await new Even({ n: 4 }).isValid()).toBe(true);
        expect(await new Even({ n: 3 }).isValid()).toBe(false);
      });
    });

    describe("inclusion", () => {
      class Status extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("status", "string");
          this.validates("status", { inclusion: { in: ["draft", "published"] } });
        }
      }
      interface Status extends Attributes {}

      it("validates inclusion of", async () => {
        expect(await new Status({ status: "draft" }).isValid()).toBe(true);
      });

      it("rejects non-included values", async () => {
        const s = new Status({ status: "invalid" });
        expect(await s.isValid()).toBe(false);
        expect(s.errors.messagesFor("status")).toContain("is not included in the list");
      });
    });

    describe("exclusion", () => {
      class NoAdmin extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["admin", "root"] } });
        }
      }
      interface NoAdmin extends Attributes {}

      it("accepts non-excluded values", async () => {
        expect(await new NoAdmin({ role: "user" }).isValid()).toBe(true);
      });

      it("validates exclusion of", async () => {
        const n = new NoAdmin({ role: "admin" });
        expect(await n.isValid()).toBe(false);
        expect(n.errors.messagesFor("role")).toContain("is reserved");
      });
    });

    describe("format", () => {
      class Email extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("email", "string");
          this.validates("email", { format: { with: /^[^@]+@[^@]+$/, multiline: true } });
        }
      }
      interface Email extends Attributes {}

      it("validate format", async () => {
        expect(await new Email({ email: "dean@example.com" }).isValid()).toBe(true);
      });

      it("rejects non-matching format", async () => {
        const e = new Email({ email: "not-an-email" });
        expect(await e.isValid()).toBe(false);
        expect(e.errors.messagesFor("email")).toContain("is invalid");
      });

      it("skips null", async () => {
        class NilSkippingEmail extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("email", "string");
            this.validates("email", {
              format: { with: /^[^@]+@[^@]+$/, multiline: true, allowNil: true },
            });
          }
        }
        interface NilSkippingEmail extends Attributes {}

        expect(await new NilSkippingEmail({}).isValid()).toBe(true);
      });
    });

    describe("acceptance", () => {
      class Terms extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("accepted", "boolean");
          this.validates("accepted", { acceptance: true });
        }
      }
      interface Terms extends Attributes {}

      it("terms of service agreement", async () => {
        expect(await new Terms({ accepted: "1" }).isValid()).toBe(true);
        expect(await new Terms({ accepted: true }).isValid()).toBe(true);
      });

      it("terms of service agreement no acceptance", async () => {
        expect(await new Terms({ accepted: "0" }).isValid()).toBe(false);
        expect(await new Terms({ accepted: false }).isValid()).toBe(false);
      });

      it("terms of service agreement with accept value", async () => {
        class Custom extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("agreed", "string");
            this.validates("agreed", {
              acceptance: { accept: ["I agree", "yes"] },
            });
          }
        }
        interface Custom extends Attributes {}

        expect(await new Custom({ agreed: "I agree" }).isValid()).toBe(true);
        expect(await new Custom({ agreed: "no" }).isValid()).toBe(false);
      });
    });

    describe("confirmation", () => {
      class WithConfirm extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("password", "string");
          this.validates("password", { confirmation: true });
        }
      }
      interface WithConfirm extends Attributes {}

      it("passes when no confirmation field set", async () => {
        expect(await new WithConfirm({ password: "secret" }).isValid()).toBe(true);
      });

      it("title confirmation", async () => {
        expect(
          await new WithConfirm({
            password: "secret",
            passwordConfirmation: "secret",
          }).isValid(),
        ).toBe(true);
      });

      it("no title confirmation", async () => {
        const w = new WithConfirm({
          password: "secret",
          passwordConfirmation: "wrong",
        });
        expect(await w.isValid()).toBe(false);
        expect(w.errors.messagesFor("passwordConfirmation")).toContain("doesn't match Password");
      });
    });

    describe("conditional", () => {
      it("if validation using block false", async () => {
        class Cond extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("name", "string");
            this.attribute("requireName", "boolean", { default: false });
            this.validates("name", {
              presence: {
                if: (r: any) => r._readAttribute("requireName") === true,
              },
            });
          }
        }
        interface Cond extends Attributes {}

        expect(await new Cond({ requireName: false }).isValid()).toBe(true);
        expect(await new Cond({ requireName: true }).isValid()).toBe(false);
      });

      it("unless validation using block true", async () => {
        class Unless extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("name", "string");
            this.attribute("optional", "boolean", { default: false });
            this.validates("name", {
              presence: {
                unless: (r: any) => r._readAttribute("optional") === true,
              },
            });
          }
        }
        interface Unless extends Attributes {}

        expect(await new Unless({ optional: true }).isValid()).toBe(true);
        expect(await new Unless({ optional: false }).isValid()).toBe(false);
      });
    });

    describe("custom validate", () => {
      it("function validator", async () => {
        class Custom extends Model {
          declare static attribute: AttributesClassHalf["attribute"];

          static {
            include(this, Attributes);
            this.attribute("value", "integer");
            this.validate(function (record: any) {
              const val = record._readAttribute("value");
              if (val !== null && (val as number) % 2 !== 0) {
                record.errors.add("value", ":even", { message: "must be even" });
              }
            });
          }
        }
        interface Custom extends Attributes {}

        expect(await new Custom({ value: 4 }).isValid()).toBe(true);
        const c = new Custom({ value: 3 });
        expect(await c.isValid()).toBe(false);
        expect(c.errors.messagesFor("value")).toContain("must be even");
      });
    });

    it("invalid should be the opposite of valid", async () => {
      class Required extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Required extends Attributes {}

      expect(await new Required().isInvalid()).toBe(true);
      expect(await new Required({ name: "dean" }).isInvalid()).toBe(false);
    });

    it("fullMessages prefixes attribute name", async () => {
      class FM extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("title", "string");
          this.validates("title", { presence: true });
        }
      }
      interface FM extends Attributes {}

      const f = new FM();
      await f.isValid();
      expect(f.errors.fullMessages).toContain("Title can't be blank");
    });

    it("fullMessages for :base has no prefix", async () => {
      class Base extends Model {
        static {
          this.validate((record: any) => {
            record.errors.add("base", ":invalid", { message: "is broken" });
          });
        }
      }
      const b = new Base();
      await b.isValid();
      expect(b.errors.fullMessages).toContain("is broken");
    });

    it("errors are cleared between isValid calls", async () => {
      class Clearable extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface Clearable extends Attributes {}

      const c = new Clearable();
      await c.isValid();
      expect(c.errors.count).toBeGreaterThan(0);
      c._writeAttribute("name", "dean");
      await c.isValid();
      expect(c.errors.count).toBe(0);
    });
  });
  describe("custom messages", () => {
    it("presence with custom message", async () => {
      class Custom extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: { message: "is required" } });
        }
      }
      interface Custom extends Attributes {}

      const c = new Custom();
      await c.isValid();
      expect(c.errors.messagesFor("name")).toContain("is required");
    });

    it("length with custom tooShort and tooLong", async () => {
      class Custom extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", {
            length: { minimum: 3, maximum: 5, tooShort: "too few!", tooLong: "too many!" },
          });
        }
      }
      interface Custom extends Attributes {}

      const short = new Custom({ name: "ab" });
      await short.isValid();
      expect(short.errors.messagesFor("name")).toContain("too few!");

      const long = new Custom({ name: "abcdef" });
      await long.isValid();
      expect(long.errors.messagesFor("name")).toContain("too many!");
    });
  });
  describe("errors.fullMessagesFor()", () => {
    it("full_messages_for contains all the error messages for the given attribute indifferent", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true });
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      await u.isValid();
      expect(u.errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
      expect(u.errors.fullMessagesFor("email")).toEqual(["Email can't be blank"]);
      expect(u.errors.fullMessagesFor("other")).toEqual([]);
    });
  });

  describe("errors.ofKind()", () => {
    it("of_kind? defaults message to :invalid", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      await u.isValid();
      expect(u.errors.ofKind("name", ":blank")).toBe(true);
      expect(u.errors.ofKind("name", ":invalid")).toBe(false);
      expect(u.errors.ofKind("name")).toBe(false);
    });
  });

  describe("validators / validatorsOn", () => {
    it("returns all registered validators", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true, length: { minimum: 5 } });
        }
      }
      interface User extends Attributes {}

      const validators = User.validators();
      expect(validators.length).toBe(3);
    });

    it("returns validators for a specific attribute", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true, length: { minimum: 2, maximum: 50 } });
          this.validates("email", { presence: true });
        }
      }
      interface User extends Attributes {}

      const nameValidators = User.validatorsOn("name");
      expect(nameValidators.length).toBe(2);
      const emailValidators = User.validatorsOn("email");
      expect(emailValidators.length).toBe(1);
    });

    it("returns empty array for attribute with no validators", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("bio", "string");
          this.validates("name", { presence: true });
        }
      }
      interface User extends Attributes {}

      expect(User.validatorsOn("bio")).toEqual([]);
    });
  });

  describe("custom validation contexts", () => {
    it("with a class that adds errors on create and validating a new model", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("terms_accepted", "string");
          this.validates("name", { presence: true });
          this.validates("terms_accepted", { presence: true, on: "registration" });
        }
      }
      interface User extends Attributes {}

      const u = new User({ name: "Alice" });
      expect(await u.isValid()).toBe(true);
      expect(await u.isValid("registration")).toBe(false);
    });

    it("with a class that adds errors on update and validating a new model", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true, on: "create" });
        }
      }
      interface User extends Attributes {}

      const u = new User({ name: "Alice" });
      expect(await u.isValid("create")).toBe(false);
      expect(await u.isValid("update")).toBe(true);
    });
  });

  describe("Errors enhancements", () => {
    it("delete removes details on given attribute", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      u.errors.add("name", ":too_short");
      u.errors.add("email", ":blank");
      const removed = u.errors.delete("name");
      expect(removed!.length).toBe(2);
      expect(u.errors.count).toBe(1);
    });

    it("delete with type only removes matching errors", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      u.errors.add("name", ":too_short");
      const removed = u.errors.delete("name", ":blank");
      expect(removed!.length).toBe(1);
      expect(u.errors.count).toBe(1);
    });

    it("each iterates over all errors", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      u.errors.add("email", ":invalid");
      const collected: string[] = [];
      u.errors.each((e) => collected.push(`${e.attribute}:${e.type}`));
      expect(collected).toEqual(["name::blank", "email::invalid"]);
    });

    it("merge errors", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u1 = new User({});
      const u2 = new User({});
      u1.errors.add("name", ":blank");
      u2.errors.mergeBang(u1.errors);
      expect(u2.errors.count).toBe(1);
      expect(u2.errors.messagesFor("name")).toEqual(["can't be blank"]);
    });

    it("to_hash returns the error messages hash", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      u.errors.add("name", ":too_short");
      u.errors.add("email", ":invalid");
      const hash = u.errors.toHash();
      expect(hash.get("name")!.length).toBe(2);
      expect(hash.get("email")!.length).toBe(1);
    });

    it("include?", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      expect(u.errors.include("name")).toBe(true);
      expect(u.errors.include("email")).toBe(false);
    });

    it("messages returns grouped messages", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      u.errors.add("name", ":blank");
      expect(u.errors.messages.get("name")).toEqual(["can't be blank"]);
    });

    it("full_messages creates a list of error messages with the attribute name included", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      expect(u.errors.fullMessage("name", "is required")).toBe("Name is required");
      expect(u.errors.fullMessage("base", "Something went wrong")).toBe("Something went wrong");
    });
  });

  describe("conditional validates (if/unless)", () => {
    it("skips validation when if condition returns false", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("requires_name", "boolean");
          this.validates("name", {
            presence: true,
            if: (record: any) => record._readAttribute("requires_name") === true,
          });
        }
      }
      interface User extends Attributes {}

      const u = new User({ requires_name: false });
      expect(await u.isValid()).toBe(true);
    });

    it("runs validation when if condition returns true", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("requires_name", "boolean");
          this.validates("name", {
            presence: true,
            if: (record: any) => record._readAttribute("requires_name") === true,
          });
        }
      }
      interface User extends Attributes {}

      const u = new User({ requires_name: true });
      expect(await u.isValid()).toBe(false);
    });

    it("skips validation when unless condition returns true", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("skip_validation", "boolean");
          this.validates("name", {
            presence: true,
            unless: (record: any) => record._readAttribute("skip_validation") === true,
          });
        }
      }
      interface User extends Attributes {}

      const u = new User({ skip_validation: true });
      expect(await u.isValid()).toBe(true);
    });

    it("runs validation when unless condition returns false", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("skip_validation", "boolean");
          this.validates("name", {
            presence: true,
            unless: (record: any) => record._readAttribute("skip_validation") === true,
          });
        }
      }
      interface User extends Attributes {}

      const u = new User({ skip_validation: false });
      expect(await u.isValid()).toBe(false);
    });
  });

  describe("validates_*_of shorthand methods", () => {
    it("validate presences", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validatesPresenceOf("name", "email");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      expect(await u.isValid()).toBe(false);
      expect(u.errors.messagesFor("name").length).toBeGreaterThan(0);
      expect(u.errors.messagesFor("email").length).toBeGreaterThan(0);
    });

    it("validates absence of", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("spam", "string");
          this.validatesAbsenceOf("spam");
        }
      }
      interface User extends Attributes {}

      const u = new User({ spam: "not empty" });
      expect(await u.isValid()).toBe(false);
    });

    it("validatesLengthOf validates length", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validatesLengthOf("name", { minimum: 3 });
        }
      }
      interface User extends Attributes {}

      expect(await new User({ name: "AB" }).isValid()).toBe(false);
      expect(await new User({ name: "ABC" }).isValid()).toBe(true);
    });

    it("validatesSizeOf is an alias for validatesLengthOf", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validatesSizeOf("name", { minimum: 3 });
        }
      }
      interface User extends Attributes {}

      expect(await new User({ name: "AB" }).isValid()).toBe(false);
      expect(await new User({ name: "ABC" }).isValid()).toBe(true);
    });

    it("validatesNumericalityOf validates numericality", async () => {
      class Item extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("price", "float");
          this.validatesNumericalityOf("price", { greaterThan: 0 });
        }
      }
      interface Item extends Attributes {}

      expect(await new Item({ price: -1 }).isValid()).toBe(false);
      expect(await new Item({ price: 10 }).isValid()).toBe(true);
    });

    it("validatesInclusionOf validates inclusion", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("role", "string");
          this.validatesInclusionOf("role", { in: ["admin", "user"] });
        }
      }
      interface User extends Attributes {}

      expect(await new User({ role: "hacker" }).isValid()).toBe(false);
      expect(await new User({ role: "admin" }).isValid()).toBe(true);
    });

    it("validatesFormatOf validates format", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("email", "string");
          this.validatesFormatOf("email", { with: /@/ });
        }
      }
      interface User extends Attributes {}

      expect(await new User({ email: "nope" }).isValid()).toBe(false);
      expect(await new User({ email: "a@b.com" }).isValid()).toBe(true);
    });

    it("validatesConfirmationOf validates confirmation", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("password", "string");
          this.validatesConfirmationOf("password");
        }
      }
      interface User extends Attributes {}

      const u = new User({ password: "secret", passwordConfirmation: "mismatch" });
      expect(await u.isValid()).toBe(false);
    });

    it("validatesLengthOf accepts multiple attributes", async () => {
      class Topic extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("title", "string");
          this.attribute("content", "string");
          this.validatesLengthOf("title", "content", { minimum: 2 });
        }
      }
      interface Topic extends Attributes {}

      const t = new Topic({ title: "", content: "" });
      expect(await t.isValid()).toBe(false);
      expect(t.errors.messagesFor("title").length).toBeGreaterThan(0);
      expect(t.errors.messagesFor("content").length).toBeGreaterThan(0);
      expect(await new Topic({ title: "ok", content: "ok" }).isValid()).toBe(true);
    });

    it("validatesPresenceOf passes through strict option", async () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.validatesPresenceOf("name", { strict: true });
        }
      }
      interface User extends Attributes {}

      await expect(new User({}).isValid()).rejects.toThrow();
      expect(await new User({ name: "Alice" }).isValid()).toBe(true);
    });

    it("validatesPresenceOf passes through if and on options", async () => {
      class Topic extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("title", "string");
          this.validatesPresenceOf("title", { if: () => true, on: "update" });
        }
      }
      interface Topic extends Attributes {}

      expect(await new Topic({ title: "" }).isValid()).toBe(true);
      expect(await new Topic({ title: "" }).isInvalid("update")).toBe(true);
    });

    it("validatesPresenceOf passes through unless option", async () => {
      class Topic extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("title", "string");
          this.validatesPresenceOf("title", { unless: () => true });
        }
      }
      interface Topic extends Attributes {}

      expect(await new Topic({ title: "" }).isValid()).toBe(true);
    });
  });

  describe("initialize_dup", () => {
    class DupTopic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    interface DupTopic extends Attributes {}

    it("gives the copy its own empty Errors", async () => {
      const topic = new DupTopic();
      expect(await topic.isValid()).toBe(false);
      expect(topic.errors.empty).toBe(false);

      const duped = topic.dup();
      expect(duped.errors).not.toBe(topic.errors);
      expect(duped.errors.empty).toBe(true);
    });
  });

  describe("Errors#generateMessage", () => {
    it("generate_message works without i18n_scope", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      expect(u.errors.generateMessage("name", ":blank")).toBe("can't be blank");
      expect(u.errors.generateMessage("name", ":invalid")).toBe("is invalid");
    });

    it("substitutes options into message", () => {
      class User extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      interface User extends Attributes {}

      const u = new User({});
      expect(u.errors.generateMessage("age", ":greater_than", { count: 0 })).toBe(
        "must be greater than 0",
      );
    });
  });

  describe("include Validations", () => {
    interface Host extends Validations {
      title: string | null;
    }

    class Host {
      declare static modelName: ModelName;
      declare static i18nScope: string;
      declare static lookupAncestors: () => Array<{
        new (...args: never[]): unknown;
        modelName: ModelName;
      }>;
      declare static humanAttributeName: typeof humanAttributeName;

      title: string | null = null;

      constructor() {
        this.errors = new Errors(this);
      }

      readAttributeForValidation(attribute: string): unknown {
        return (this as unknown as Record<string, unknown>)[attribute];
      }
    }
    include(Host, Validations);
    (Host as unknown as { validates(...args: unknown[]): void }).validates("title", {
      presence: true,
    });

    it("gives the includer the class macros and the runner", async () => {
      const host = new Host();
      expect(await host.isValid()).toBe(false);
      expect(host.errors.messages.get("title")).toEqual(["can't be blank"]);

      host.title = "hello";
      expect(await host.isValid()).toBe(true);
    });

    it("gives the includer model_name and the Translation readers that resolve through it", () => {
      expect(Host.modelName.name).toBe("Host");
      expect(Host.i18nScope).toBe("activemodel");
      expect(Host.humanAttributeName("title")).toBe("Title");
    });
  });
});

describe("validate with several filters", () => {
  it("registers every filter in the order one set_callback would", async () => {
    const ran: string[] = [];
    class Topic extends Model {
      first(): void {
        ran.push("first");
      }
      second(): void {
        ran.push("second");
      }
      static {
        this.validate("first", "second");
      }
    }

    await new Topic().isValid();
    expect(ran).toEqual(["first", "second"]);
  });

  it("raises on an unknown key only when every filter is a method name", () => {
    expect(() => {
      class Bad extends Model {
        static {
          this.validate("first", "second", { presence: true } as never);
        }
      }
      void Bad;
    }).toThrow(/Unknown key: :presence/);

    expect(() => {
      class Blocky extends Model {
        static {
          this.validate(() => undefined, { presence: true } as never);
        }
      }
      void Blocky;
    }).not.toThrow();
  });
});
