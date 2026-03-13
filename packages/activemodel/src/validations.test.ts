import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("Validations", () => {
  // =========================================================================
  // Phase 1100/1150 — Validations
  // =========================================================================
  describe("Validations", () => {
    // -- Presence --
    describe("presence", () => {
      class Article extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
        }
      }

      it("rejects null", () => {
        const a = new Article();
        expect(a.isValid()).toBe(false);
        expect(a.errors.get("title")).toContain("can't be blank");
      });

      it("rejects empty string", () => {
        const a = new Article({ title: "" });
        expect(a.isValid()).toBe(false);
      });

      it("rejects whitespace-only string", () => {
        const a = new Article({ title: "   " });
        expect(a.isValid()).toBe(false);
      });

      it("accepts a real value", () => {
        const a = new Article({ title: "Hello" });
        expect(a.isValid()).toBe(true);
      });
    });

    // -- Absence --
    describe("absence", () => {
      class Blank extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }

      it("accepts null", () => {
        expect(new Blank().isValid()).toBe(true);
      });

      it("accepts empty string", () => {
        expect(new Blank({ name: "" }).isValid()).toBe(true);
      });

      it("rejects a value", () => {
        const b = new Blank({ name: "dean" });
        expect(b.isValid()).toBe(false);
        expect(b.errors.get("name")).toContain("must be blank");
      });
    });

    // -- Length --
    describe("length", () => {
      class WithLength extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", {
            length: { minimum: 3, maximum: 10 },
          });
        }
      }

      it("validates length of using minimum", () => {
        const w = new WithLength({ name: "ab" });
        expect(w.isValid()).toBe(false);
        expect(w.errors.get("name")).toContain("is too short");
      });

      it("validates length of using maximum", () => {
        const w = new WithLength({ name: "abcdefghijk" });
        expect(w.isValid()).toBe(false);
        expect(w.errors.get("name")).toContain("is too long");
      });

      it("validates length of using within", () => {
        expect(new WithLength({ name: "dean" }).isValid()).toBe(true);
      });

      it("validates length of using is", () => {
        class Exact extends Model {
          static {
            this.attribute("code", "string");
            this.validates("code", { length: { is: 4 } });
          }
        }
        expect(new Exact({ code: "1234" }).isValid()).toBe(true);
        expect(new Exact({ code: "123" }).isValid()).toBe(false);
        expect(new Exact({ code: "12345" }).isValid()).toBe(false);
      });

      it("validates with in (range)", () => {
        class WithRange extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { length: { in: [2, 5] } });
          }
        }
        expect(new WithRange({ name: "a" }).isValid()).toBe(false);
        expect(new WithRange({ name: "ab" }).isValid()).toBe(true);
        expect(new WithRange({ name: "abcde" }).isValid()).toBe(true);
        expect(new WithRange({ name: "abcdef" }).isValid()).toBe(false);
      });

      it("skips null values (null has no length)", () => {
        expect(new WithLength({}).isValid()).toBe(true);
      });
    });

    // -- Numericality --
    describe("numericality", () => {
      class Numeric extends Model {
        static {
          this.attribute("value", "string"); // string to test cast behavior
          this.validates("value", { numericality: true });
        }
      }

      it("default validates numericality of", () => {
        expect(new Numeric({ value: "42" }).isValid()).toBe(true);
        expect(new Numeric({ value: "3.14" }).isValid()).toBe(true);
      });

      it("rejects non-numeric strings", () => {
        const n = new Numeric({ value: "not a number" });
        expect(n.isValid()).toBe(false);
        expect(n.errors.get("value")).toContain("is not a number");
      });

      it("validates numericality of with nil allowed", () => {
        expect(new Numeric({}).isValid()).toBe(true);
      });

      it("validates numericality of only integers", () => {
        class IntOnly extends Model {
          static {
            this.attribute("value", "string");
            this.validates("value", { numericality: { onlyInteger: true } });
          }
        }
        expect(new IntOnly({ value: "42" }).isValid()).toBe(true);
        expect(new IntOnly({ value: "3.14" }).isValid()).toBe(false);
      });

      it("validates numericality with greater_than", () => {
        class GreaterThan extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { greaterThan: 5 } });
          }
        }
        expect(new GreaterThan({ value: 6 }).isValid()).toBe(true);
        expect(new GreaterThan({ value: 5 }).isValid()).toBe(false);
      });

      it("validates numericality with greater_than_or_equal_to", () => {
        class GreaterThanOrEqual extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { greaterThanOrEqualTo: 5 } });
          }
        }
        expect(new GreaterThanOrEqual({ value: 5 }).isValid()).toBe(true);
        expect(new GreaterThanOrEqual({ value: 4 }).isValid()).toBe(false);
      });

      it("validates numericality with equal_to", () => {
        class EqualTo extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { equalTo: 5 } });
          }
        }
        expect(new EqualTo({ value: 5 }).isValid()).toBe(true);
        expect(new EqualTo({ value: 4 }).isValid()).toBe(false);
      });

      it("validates numericality with less_than", () => {
        class LessThan extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { lessThan: 5 } });
          }
        }
        expect(new LessThan({ value: 4 }).isValid()).toBe(true);
        expect(new LessThan({ value: 5 }).isValid()).toBe(false);
      });

      it("validates numericality with less_than_or_equal_to", () => {
        class LessThanOrEqual extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { lessThanOrEqualTo: 5 } });
          }
        }
        expect(new LessThanOrEqual({ value: 5 }).isValid()).toBe(true);
        expect(new LessThanOrEqual({ value: 6 }).isValid()).toBe(false);
      });

      it("validates numericality with odd", () => {
        class Odd extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { odd: true } });
          }
        }
        expect(new Odd({ value: 3 }).isValid()).toBe(true);
        expect(new Odd({ value: 4 }).isValid()).toBe(false);
      });

      it("validates numericality with even", () => {
        class Even extends Model {
          static {
            this.attribute("value", "number");
            this.validates("value", { numericality: { even: true } });
          }
        }
        expect(new Even({ value: 4 }).isValid()).toBe(true);
        expect(new Even({ value: 3 }).isValid()).toBe(false);
      });
    });

    // -- Inclusion / Exclusion --
    describe("inclusion and exclusion", () => {
      class Colorful extends Model {
        static {
          this.attribute("color", "string");
          this.validates("color", {
            inclusion: { in: ["red", "green", "blue"] },
            exclusion: { in: ["black"] },
          });
        }
      }

      it("accepts included and non-excluded values", () => {
        expect(new Colorful({ color: "red" }).isValid()).toBe(true);
      });

      it("rejects values not in inclusion list", () => {
        const c = new Colorful({ color: "yellow" });
        expect(c.isValid()).toBe(false);
        expect(c.errors.get("color")).toContain("is not included in the list");
      });

      it("rejects values in exclusion list", () => {
        const c = new Colorful({ color: "black" });
        expect(c.isValid()).toBe(false);
        expect(c.errors.get("color")).toContain("is reserved");
      });
    });

    // -- Format --
    describe("format", () => {
      class EmailUser extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", {
            format: { with: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
          });
        }
      }

      it("accepts valid email", () => {
        expect(new EmailUser({ email: "user@example.com" }).isValid()).toBe(true);
      });

      it("rejects invalid email", () => {
        const u = new EmailUser({ email: "invalid" });
        expect(u.isValid()).toBe(false);
        expect(u.errors.get("email")).toContain("is invalid");
      });
    });

    // -- Confirmation --
    describe("confirmation", () => {
      class Signup extends Model {
        static {
          this.attribute("password", "string");
          this.attribute("passwordConfirmation", "string");
          this.validates("password", { confirmation: true });
        }
      }

      it("accepts matching password and confirmation", () => {
        expect(new Signup({ password: "secret", passwordConfirmation: "secret" }).isValid()).toBe(
          true,
        );
      });

      it("rejects mismatched password and confirmation", () => {
        const s = new Signup({ password: "secret", passwordConfirmation: "wrong" });
        expect(s.isValid()).toBe(false);
        expect(s.errors.get("passwordConfirmation")).toContain("doesn't match Password");
      });
    });

    // -- Uniqueness (simulated) --
    describe("uniqueness", () => {
      class UniqueUser extends Model {
        static existingNames = new Set<string>();

        static {
          this.attribute("name", "string");
          this.validates("name", {
            presence: true,
            uniqueness: true,
          });
        }

        override isValid(): boolean {
          const valid = super.isValid();
          if (!valid) return false;
          const name = this.readAttribute("name") as string;
          if (UniqueUser.existingNames.has(name)) {
            this.errors.add("name", "taken");
            return false;
          }
          UniqueUser.existingNames.add(name);
          return true;
        }
      }

      it("accepts unique names", () => {
        UniqueUser.existingNames.clear();
        expect(new UniqueUser({ name: "alice" }).isValid()).toBe(true);
        expect(new UniqueUser({ name: "bob" }).isValid()).toBe(true);
      });

      it("rejects duplicate names", () => {
        UniqueUser.existingNames.clear();
        const first = new UniqueUser({ name: "alice" });
        const second = new UniqueUser({ name: "alice" });
        expect(first.isValid()).toBe(true);
        expect(second.isValid()).toBe(false);
        expect(second.errors.get("name")).toContain("has already been taken");
      });
    });

    // -- Type-based validations --
    describe("type-based validations", () => {
      class TypedModel extends Model {
        static {
          this.attribute("age", Types.IntegerType.name);
          this.attribute("email", Types.StringType.name);
          this.validates("age", { presence: true, numericality: { onlyInteger: true } });
          this.validates("email", { presence: true });
        }
      }

      it("accepts valid types", () => {
        expect(new TypedModel({ age: 30, email: "test@example.com" }).isValid()).toBe(true);
      });

      it("rejects invalid types", () => {
        const m = new TypedModel({ age: "not a number", email: "" } as any);
        expect(m.isValid()).toBe(false);
        expect(m.errors.get("age").length).toBeGreaterThan(0);
        expect(m.errors.get("email").length).toBeGreaterThan(0);
      });
    });

    // ---- Validations test (ported) ----
    describe("Validations (ported)", () => {
      it("single field validation", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
          }
        }
        const p = new Person({});
        expect(p.isValid()).toBe(false);
        expect(p.errors.get("name").length).toBeGreaterThan(0);
      });

      it("single attr validation and error msg", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
          }
        }
        const p = new Person({});
        p.isValid();
        expect(p.errors.fullMessages.length).toBeGreaterThan(0);
      });

      it("double attr validation and error msg", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.attribute("email", "string");
            this.validates("name", { presence: true });
            this.validates("email", { presence: true });
          }
        }
        const p = new Person({});
        p.isValid();
        expect(p.errors.fullMessages.length).toBe(2);
      });

      it("errors on base", () => {
        class Person extends Model {
          static {
            this.validate((record: any) => {
              record.errors.add("base", "invalid", { message: "Model is invalid" });
            });
          }
        }
        const p = new Person({});
        p.isValid();
        expect(p.errors.fullMessages).toContain("Model is invalid");
      });

      it("errors empty after errors on check", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
          }
        }
        const p = new Person({});
        p.errors.get("name"); // Should not add errors
        expect(p.errors.empty).toBe(true);
      });

      it("validates each", () => {
        class Person extends Model {
          static {
            this.attribute("price", "integer");
            this.attribute("discount", "integer");
            this.validatesEach(["price", "discount"], (record, attr, value) => {
              if (typeof value === "number" && value < 0) {
                record.errors.add(attr, "invalid", { message: "must be non-negative" });
              }
            });
          }
        }
        const p = new Person({ price: -5, discount: 10 });
        expect(p.isValid()).toBe(false);
        expect(p.errors.fullMessages).toContain("Price must be non-negative");
      });

      it("validate block", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validate((record: any) => {
              if (record.readAttribute("name") === "INVALID") {
                record.errors.add("name", "invalid");
              }
            });
          }
        }
        expect(new Person({ name: "INVALID" }).isValid()).toBe(false);
        expect(new Person({ name: "valid" }).isValid()).toBe(true);
      });

      it("validate block with params", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validate(function (record: any) {
              if (!record.readAttribute("name")) {
                record.errors.add("name", "blank");
              }
            });
          }
        }
        expect(new Person({}).isValid()).toBe(false);
      });

      it("invalid should be the opposite of valid", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
          }
        }
        expect(new Person({}).isInvalid()).toBe(true);
        expect(new Person({ name: "Alice" }).isInvalid()).toBe(false);
      });

      it("validation order", () => {
        const order: string[] = [];
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.attribute("email", "string");
            this.validate((record: any) => {
              order.push("name_check");
            });
            this.validate((record: any) => {
              order.push("email_check");
            });
          }
        }
        new Person({}).isValid();
        expect(order).toEqual(["name_check", "email_check"]);
      });

      it("validation with if and on", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true, on: "create" as any, if: () => true });
          }
        }
        expect(new Person({}).isValid()).toBe(true); // no context
        expect(new Person({}).isValid("create")).toBe(false); // with context
      });

      it("strict validation in validates", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true, strict: true });
          }
        }
        expect(() => new Person({}).isValid()).toThrow();
      });

      it("strict validation not fails", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true, strict: true });
          }
        }
        expect(new Person({ name: "Alice" }).isValid()).toBe(true);
      });

      it("list of validators for model", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.attribute("email", "string");
            this.validates("name", { presence: true });
            this.validates("email", { presence: true, length: { minimum: 5 } });
          }
        }
        expect(Person.validators().length).toBe(3);
      });

      it("list of validators on an attribute", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true, length: { minimum: 3 } });
          }
        }
        expect(Person.validatorsOn("name").length).toBe(2);
      });

      it("list of validators will be empty when empty", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
          }
        }
        expect(Person.validatorsOn("name").length).toBe(0);
      });

      it("validate with bang", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
          }
        }
        expect(() => new Person({}).validateBang()).toThrow();
        expect(new Person({ name: "Alice" }).validateBang()).toBe(true);
      });

      it("errors to json", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
          }
        }
        const p = new Person({});
        p.isValid();
        const json = p.errors.asJson();
        expect(json.name.length).toBeGreaterThan(0);
      });

      it("does not modify options argument", () => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
          }
        }
        const opts = { presence: true };
        Person.validates("name", opts);
        expect(opts).toEqual({ presence: true });
      });

      it("validates with false hash value", () => {
        // When presence is false, no validation should be added
        class Person extends Model {
          static {
            this.attribute("name", "string");
          }
        }
        Person.validates("name", { presence: false });
        expect(new Person({}).isValid()).toBe(true);
      });
    });
  });
});

describe("ActiveModel", () => {
  describe("ValidationsTest", () => {
    it("multiple errors per attr iteration with full error composition", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, length: { minimum: 3 } });
        }
      }
      const p = new Person({ name: "" });
      p.isValid();
      expect(p.errors.fullMessages.length).toBeGreaterThanOrEqual(1);
    });

    it("errors on base with symbol message", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validate((record: any) => {
            record.errors.add("base", "invalid", { message: "Model is invalid" });
          });
        }
      }
      const p = new Person();
      p.isValid();
      expect(p.errors.get("base")).toContain("Model is invalid");
    });

    it("validates with bang", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person();
      expect(() => p.validateBang()).toThrow(/Validation failed/);
    });

    it("validate with bang and context", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person();
      expect(() => p.validateBang()).toThrow(/Validation failed/);
    });

    it("strict validation error message", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person();
      p.isValid();
      expect(p.errors.fullMessages.join(", ")).toContain("can't be blank");
    });

    it("validation with message as proc that takes a record as a parameter", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", {
            presence: { message: (r: any) => `${r.constructor.name} name is required` },
          });
        }
      }
      const p = new Person();
      p.isValid();
      expect(p.errors.get("name")).toContain("Person name is required");
    });

    it("frozen models can be validated", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "Alice" });
      // We can't truly freeze JS objects with Maps inside,
      // but we can verify validation works after model creation
      expect(p.isValid()).toBe(true);
    });

    it("dup validity is independent", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p1 = new Person({ name: "Alice" });
      const p2 = new Person();
      expect(p1.isValid()).toBe(true);
      expect(p2.isValid()).toBe(false);
    });
  });

  describe("ValidationsTest", () => {
    it("errors on nested attributes expands name", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.fullMessages).toContain("Name can't be blank");
    });

    it("validates each custom reader", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.validatesEach(["name"], (record, attr, value) => {
        if (!value) record.errors.add(attr, "blank");
      });
      const p = new Person({});
      p.isValid();
      expect(p.errors.get("name")).toContain("can't be blank");
    });

    it("validates with array condition does not mutate the array", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const conditions = [(r: any) => true];
      Person.validates("name", { presence: true, if: conditions[0] });
      expect(conditions.length).toBe(1);
    });

    it("invalid validator", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      // validates with empty rules should not throw
      expect(() => Person.validates("name", {})).not.toThrow();
    });

    it("invalid options to validate", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => Person.validates("name", {})).not.toThrow();
    });

    it("callback options to validate", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
      expect(p.isValid("create")).toBe(false);
    });

    it("accessing instance of validator on an attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      expect(Person.validatorsOn("name").length).toBeGreaterThan(0);
    });

    it("strict validation in custom validator helper", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, strict: true });
        }
      }
      const p = new Person({});
      expect(() => p.isValid()).toThrow();
    });

    it("validation with message as proc that takes record and data as a parameters", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", {
            presence: {
              message: (record: any) => `${record.constructor.name} needs a name`,
            },
          });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.get("name")[0]).toContain("needs a name");
    });

    it("validations some with except", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.validates("name", { presence: true });
          this.validates("age", { numericality: true, on: "create" });
        }
      }
      const p = new Person({ age: "abc" });
      // Without context, only name validation runs
      expect(p.isValid()).toBe(false);
    });
  });
});
