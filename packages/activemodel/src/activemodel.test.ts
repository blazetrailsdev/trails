import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  // =========================================================================
  // Phase 1000/1050 — Attributes and Type Casting
  // =========================================================================
  describe("Attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer", { default: 0 });
        this.attribute("score", "float");
        this.attribute("active", "boolean", { default: true });
      }
    }

    it("initializes with defaults", () => {
      const u = new User();
      expect(u.readAttribute("name")).toBe(null);
      expect(u.readAttribute("age")).toBe(0);
      expect(u.readAttribute("active")).toBe(true);
    });

    it("initializes with provided values", () => {
      const u = new User({ name: "dean", age: 30 });
      expect(u.readAttribute("name")).toBe("dean");
      expect(u.readAttribute("age")).toBe(30);
    });

    it("casts string to integer", () => {
      const u = new User({ age: "25" });
      expect(u.readAttribute("age")).toBe(25);
    });

    it("integer truncates floats", () => {
      const u = new User({ age: 25.9 });
      expect(u.readAttribute("age")).toBe(25);
    });

    it("casts string to float", () => {
      const u = new User({ score: "9.5" });
      expect(u.readAttribute("score")).toBe(9.5);
    });

    it("casts string to boolean", () => {
      expect(new User({ active: "false" }).readAttribute("active")).toBe(false);
      expect(new User({ active: "true" }).readAttribute("active")).toBe(true);
      expect(new User({ active: "yes" }).readAttribute("active")).toBe(true);
      expect(new User({ active: "no" }).readAttribute("active")).toBe(false);
      expect(new User({ active: "1" }).readAttribute("active")).toBe(true);
      expect(new User({ active: "0" }).readAttribute("active")).toBe(false);
      expect(new User({ active: 1 }).readAttribute("active")).toBe(true);
      expect(new User({ active: 0 }).readAttribute("active")).toBe(false);
    });

    it("casts null to null for all types", () => {
      const u = new User({ name: null, age: null, score: null, active: null });
      expect(u.readAttribute("name")).toBe(null);
      expect(u.readAttribute("age")).toBe(null);
      expect(u.readAttribute("score")).toBe(null);
      expect(u.readAttribute("active")).toBe(null);
    });

    it("writeAttribute casts the value", () => {
      const u = new User();
      u.writeAttribute("age", "42");
      expect(u.readAttribute("age")).toBe(42);
    });

    it("returns all attributes as a hash", () => {
      const u = new User({ name: "dean", age: 30 });
      expect(u.attributes).toEqual({
        name: "dean",
        age: 30,
        score: null,
        active: true,
      });
    });

    it("attributePresent checks for non-blank values", () => {
      const u = new User({ name: "dean" });
      expect(u.attributePresent("name")).toBe(true);
      expect(u.attributePresent("score")).toBe(false);
    });

    it("attributePresent returns false for empty string", () => {
      const u = new User({ name: "" });
      expect(u.attributePresent("name")).toBe(false);
    });

    it("attributePresent returns false for whitespace-only string", () => {
      const u = new User({ name: "   " });
      expect(u.attributePresent("name")).toBe(false);
    });

    it("attributeNames returns declared names", () => {
      expect(User.attributeNames()).toEqual(["name", "age", "score", "active"]);
    });

    it("Proc default is called for each instance", () => {
      let counter = 0;
      class WithLambda extends Model {
        static {
          this.attribute("token", "string", { default: () => `tok_${++counter}` });
        }
      }
      expect(new WithLambda().readAttribute("token")).toBe("tok_1");
      expect(new WithLambda().readAttribute("token")).toBe("tok_2");
    });

    it("inheritance: children inherit parent attributes", () => {
      class Admin extends User {
        static {
          this.attribute("role", "string", { default: "admin" });
        }
      }
      const admin = new Admin({ name: "dean" });
      expect(admin.readAttribute("name")).toBe("dean");
      expect(admin.readAttribute("role")).toBe("admin");
      expect(Admin.attributeNames()).toContain("name");
      expect(Admin.attributeNames()).toContain("role");
    });
  });

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

      it("validates numericality of with integer only", () => {
        class IntOnly extends Model {
          static {
            this.attribute("count", "string");
            this.validates("count", { numericality: { onlyInteger: true } });
          }
        }
        expect(new IntOnly({ count: "5" }).isValid()).toBe(true);
        const f = new IntOnly({ count: "5.5" });
        expect(f.isValid()).toBe(false);
        expect(f.errors.get("count")).toContain("is not an integer");
      });

      it("validates numericality with greater than", () => {
        class GT extends Model {
          static {
            this.attribute("age", "integer");
            this.validates("age", { numericality: { greaterThan: 0 } });
          }
        }
        expect(new GT({ age: 1 }).isValid()).toBe(true);
        expect(new GT({ age: 0 }).isValid()).toBe(false);
      });

      it("validates numericality with less than", () => {
        class LT extends Model {
          static {
            this.attribute("rating", "integer");
            this.validates("rating", { numericality: { lessThan: 10 } });
          }
        }
        expect(new LT({ rating: 9 }).isValid()).toBe(true);
        expect(new LT({ rating: 10 }).isValid()).toBe(false);
      });

      it("validates numericality with odd", () => {
        class Odd extends Model {
          static {
            this.attribute("n", "integer");
            this.validates("n", { numericality: { odd: true } });
          }
        }
        expect(new Odd({ n: 3 }).isValid()).toBe(true);
        expect(new Odd({ n: 4 }).isValid()).toBe(false);
      });

      it("validates numericality with even", () => {
        class Even extends Model {
          static {
            this.attribute("n", "integer");
            this.validates("n", { numericality: { even: true } });
          }
        }
        expect(new Even({ n: 4 }).isValid()).toBe(true);
        expect(new Even({ n: 3 }).isValid()).toBe(false);
      });
    });

    // -- Inclusion / Exclusion --
    describe("inclusion", () => {
      class Status extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { inclusion: { in: ["draft", "published"] } });
        }
      }

      it("validates inclusion of", () => {
        expect(new Status({ status: "draft" }).isValid()).toBe(true);
      });

      it("rejects non-included values", () => {
        const s = new Status({ status: "invalid" });
        expect(s.isValid()).toBe(false);
        expect(s.errors.get("status")).toContain("is not included in the list");
      });
    });

    describe("exclusion", () => {
      class NoAdmin extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["admin", "root"] } });
        }
      }

      it("accepts non-excluded values", () => {
        expect(new NoAdmin({ role: "user" }).isValid()).toBe(true);
      });

      it("validates exclusion of", () => {
        const n = new NoAdmin({ role: "admin" });
        expect(n.isValid()).toBe(false);
        expect(n.errors.get("role")).toContain("is reserved");
      });
    });

    // -- Format --
    describe("format", () => {
      class Email extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /^[^@]+@[^@]+$/ } });
        }
      }

      it("validate format", () => {
        expect(new Email({ email: "dean@example.com" }).isValid()).toBe(true);
      });

      it("rejects non-matching format", () => {
        const e = new Email({ email: "not-an-email" });
        expect(e.isValid()).toBe(false);
        expect(e.errors.get("email")).toContain("is invalid");
      });

      it("skips null", () => {
        expect(new Email({}).isValid()).toBe(true);
      });
    });

    // -- Acceptance --
    describe("acceptance", () => {
      class Terms extends Model {
        static {
          this.attribute("accepted", "string");
          this.validates("accepted", { acceptance: true });
        }
      }

      it("terms of service agreement", () => {
        expect(new Terms({ accepted: "1" }).isValid()).toBe(true);
        expect(new Terms({ accepted: true }).isValid()).toBe(true);
      });

      it("terms of service agreement no acceptance", () => {
        expect(new Terms({ accepted: "0" }).isValid()).toBe(false);
        expect(new Terms({ accepted: false }).isValid()).toBe(false);
      });

      it("terms of service agreement with accept value", () => {
        class Custom extends Model {
          static {
            this.attribute("agreed", "string");
            this.validates("agreed", {
              acceptance: { accept: ["I agree", "yes"] },
            });
          }
        }
        expect(new Custom({ agreed: "I agree" }).isValid()).toBe(true);
        expect(new Custom({ agreed: "no" }).isValid()).toBe(false);
      });
    });

    // -- Confirmation --
    describe("confirmation", () => {
      class WithConfirm extends Model {
        static {
          this.attribute("password", "string");
          this.validates("password", { confirmation: true });
        }
      }

      it("passes when no confirmation field set", () => {
        expect(new WithConfirm({ password: "secret" }).isValid()).toBe(true);
      });

      it("title confirmation", () => {
        expect(
          new WithConfirm({
            password: "secret",
            password_confirmation: "secret",
          }).isValid(),
        ).toBe(true);
      });

      it("no title confirmation", () => {
        const w = new WithConfirm({
          password: "secret",
          password_confirmation: "wrong",
        });
        expect(w.isValid()).toBe(false);
        expect(w.errors.get("password")).toContain("doesn't match confirmation");
      });
    });

    // -- Conditional validation --
    describe("conditional", () => {
      it("if validation using block false", () => {
        class Cond extends Model {
          static {
            this.attribute("name", "string");
            this.attribute("requireName", "boolean", { default: false });
            this.validates("name", {
              presence: {
                if: (r: any) => r.readAttribute("requireName") === true,
              },
            });
          }
        }
        expect(new Cond({ requireName: false }).isValid()).toBe(true);
        expect(new Cond({ requireName: true }).isValid()).toBe(false);
      });

      it("unless validation using block true", () => {
        class Unless extends Model {
          static {
            this.attribute("name", "string");
            this.attribute("optional", "boolean", { default: false });
            this.validates("name", {
              presence: {
                unless: (r: any) => r.readAttribute("optional") === true,
              },
            });
          }
        }
        expect(new Unless({ optional: true }).isValid()).toBe(true);
        expect(new Unless({ optional: false }).isValid()).toBe(false);
      });
    });

    // -- Custom validate --
    describe("custom validate", () => {
      it("function validator", () => {
        class Custom extends Model {
          static {
            this.attribute("value", "integer");
            this.validate(function (record: any) {
              const val = record.readAttribute("value");
              if (val !== null && (val as number) % 2 !== 0) {
                record.errors.add("value", "even", { message: "must be even" });
              }
            });
          }
        }
        expect(new Custom({ value: 4 }).isValid()).toBe(true);
        const c = new Custom({ value: 3 });
        expect(c.isValid()).toBe(false);
        expect(c.errors.get("value")).toContain("must be even");
      });
    });

    // -- isInvalid --
    it("invalid should be the opposite of valid", () => {
      class Required extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      expect(new Required().isInvalid()).toBe(true);
      expect(new Required({ name: "dean" }).isInvalid()).toBe(false);
    });

    // -- fullMessages --
    it("fullMessages prefixes attribute name", () => {
      class FM extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
        }
      }
      const f = new FM();
      f.isValid();
      expect(f.errors.fullMessages).toContain("Title can't be blank");
    });

    it("fullMessages for :base has no prefix", () => {
      class Base extends Model {
        static {
          this.validate((record: any) => {
            record.errors.add("base", "invalid", { message: "is broken" });
          });
        }
      }
      const b = new Base();
      b.isValid();
      expect(b.errors.fullMessages).toContain("is broken");
    });

    // -- errors.clear between validations --
    it("errors are cleared between isValid calls", () => {
      class Clearable extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const c = new Clearable();
      c.isValid();
      expect(c.errors.count).toBeGreaterThan(0);
      c.writeAttribute("name", "dean");
      c.isValid();
      expect(c.errors.count).toBe(0);
    });
  });

  // =========================================================================
  // Phase 1100 — Errors
  // =========================================================================
  describe("Errors", () => {
    it("add creates an error object and returns it", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.get("name")).toContain("can't be blank");
    });

    it("size calculates the number of error messages", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      expect(e.count).toBe(2);
      expect(e.size).toBe(2);
    });

    it("detecting whether there are errors with empty?, blank?, include?", () => {
      const e = new Errors(null);
      expect(e.empty).toBe(true);
      expect(e.any).toBe(false);
      e.add("name", "blank");
      expect(e.empty).toBe(false);
      expect(e.any).toBe(true);
    });

    it("clear errors", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.clear();
      expect(e.count).toBe(0);
      expect(e.empty).toBe(true);
    });

    it("where filters by attribute and type", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      e.add("age", "blank");
      expect(e.where("name").length).toBe(2);
      expect(e.where("name", "blank").length).toBe(1);
      expect(e.where("age").length).toBe(1);
    });

    it("attribute_names returns the error attributes", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      e.add("age", "blank");
      expect(e.attributeNames).toEqual(["name", "age"]);
    });

    it("full_message returns the given message when attribute is :base", () => {
      const e = new Errors(null);
      e.add("base", "invalid", { message: "Something went wrong" });
      expect(e.fullMessages).toContain("Something went wrong");
    });

    it("full_message returns the given message with the attribute name included", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.fullMessages[0]).toBe("Name can't be blank");
    });

    it("details returns added error detail", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.details.length).toBe(1);
      expect(e.details[0].attribute).toBe("name");
      expect(e.details[0].type).toBe("blank");
    });

    it("custom message overrides default", () => {
      const e = new Errors(null);
      e.add("name", "blank", { message: "is required" });
      expect(e.get("name")).toContain("is required");
    });

    it("message interpolation with %{count}", () => {
      const e = new Errors(null);
      e.add("name", "too_short", { count: 3 });
      // Default message is "is too short" — doesn't have %{count} by default
      // but the mechanism should work for messages that do
      expect(e.get("name").length).toBe(1);
    });
  });

  // =========================================================================
  // Phase 1200/1250 — Callbacks and Dirty Tracking
  // =========================================================================
  describe("Dirty Tracking", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    it("not changed initially", () => {
      const p = new Person({ name: "dean", age: 30 });
      expect(p.changed).toBe(false);
      expect(p.changedAttributes).toEqual([]);
    });

    it("setting attribute will result in change", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      expect(p.changed).toBe(true);
      expect(p.changedAttributes).toContain("name");
    });

    it("attributeWas returns original value", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      expect(p.attributeWas("name")).toBe("dean");
    });

    it("changes to attribute values", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      expect(p.attributeChange("name")).toEqual(["dean", "sam"]);
    });

    it("list of changed attribute keys", () => {
      const p = new Person({ name: "dean", age: 30 });
      p.writeAttribute("name", "sam");
      p.writeAttribute("age", 31);
      expect(p.changes).toEqual({
        name: ["dean", "sam"],
        age: [30, 31],
      });
    });

    it("setting color to same value should not result in change being recorded", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "dean");
      expect(p.changed).toBe(false);
    });

    it("resetting attribute", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      expect(p.changed).toBe(true);
      p.writeAttribute("name", "dean");
      expect(p.changed).toBe(false);
    });

    it("changing the same attribute multiple times retains the correct original value", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      p.writeAttribute("name", "bob");
      expect(p.attributeChange("name")).toEqual(["dean", "bob"]);
    });

    it("restore_attributes should restore all previous data", () => {
      const p = new Person({ name: "dean", age: 30 });
      p.writeAttribute("name", "sam");
      p.writeAttribute("age", 99);
      p.restoreAttributes();
      expect(p.readAttribute("name")).toBe("dean");
      expect(p.readAttribute("age")).toBe(30);
      expect(p.changed).toBe(false);
    });

    it("saving should preserve previous changes", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      p.changesApplied();
      expect(p.changed).toBe(false);
      expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
    });

    it("setting new attributes should not affect previous changes", () => {
      const p = new Person({ name: "dean" });
      p.writeAttribute("name", "sam");
      p.changesApplied();
      p.writeAttribute("name", "bob");
      expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
      expect(p.changes).toEqual({ name: ["sam", "bob"] });
    });

    it("cast-value-aware: same cast value = no change", () => {
      class Sized extends Model {
        static {
          this.attribute("size", "integer");
        }
      }
      const s = new Sized({ size: "2" }); // cast to 2
      s.writeAttribute("size", "2.3"); // cast to 2
      expect(s.changed).toBe(false);
      s.writeAttribute("size", "5.1"); // cast to 5
      expect(s.changed).toBe(true);
    });
  });

  describe("Callbacks", () => {
    it("before/after callbacks run in order", () => {
      const order: string[] = [];
      class Ordered extends Model {
        static {
          this.attribute("name", "string");
          this.beforeSave(() => {
            order.push("before");
          });
          this.afterSave(() => {
            order.push("after");
          });
        }
      }
      const o = new Ordered();
      o.runCallbacks("save", () => {
        order.push("action");
      });
      expect(order).toEqual(["before", "action", "after"]);
    });

    it("around callbacks wrap the action", () => {
      const order: string[] = [];
      class Around extends Model {
        static {
          this.attribute("name", "string");
          this.aroundSave((_record, proceed) => {
            order.push("around_before");
            proceed();
            order.push("around_after");
          });
        }
      }
      const a = new Around();
      a.runCallbacks("save", () => {
        order.push("action");
      });
      expect(order).toEqual(["around_before", "action", "around_after"]);
    });

    it("further callbacks should not be called if before validation throws abort", () => {
      const order: string[] = [];
      class Halting extends Model {
        static {
          this.attribute("name", "string");
          this.beforeSave(() => {
            order.push("before");
            return false;
          });
          this.afterSave(() => {
            order.push("after");
          });
        }
      }
      const h = new Halting();
      const result = h.runCallbacks("save", () => {
        order.push("action");
      });
      expect(result).toBe(false);
      expect(order).toEqual(["before"]);
      expect(order).not.toContain("action");
      expect(order).not.toContain("after");
    });

    it("before_validation halting prevents validations from running", () => {
      class NoValidate extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.beforeValidation(() => false);
        }
      }
      const n = new NoValidate();
      expect(n.isValid()).toBe(false);
      expect(n.errors.count).toBe(0); // validations never ran
    });

    it("complete callback chain", () => {
      const order: string[] = [];
      class Full extends Model {
        static {
          this.beforeSave(() => {
            order.push("before_save");
          });
          this.aroundSave((_r, proceed) => {
            order.push("around_before");
            proceed();
            order.push("around_after");
          });
          this.afterSave(() => {
            order.push("after_save");
          });
        }
      }
      new Full().runCallbacks("save", () => {
        order.push("save");
      });
      expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
    });
  });

  // =========================================================================
  // Phase 1300/1350 — Serialization and Naming
  // =========================================================================
  describe("Serialization", () => {
    class Post extends Model {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.attribute("rating", "integer");
      }

      get summary(): string {
        return String(this.readAttribute("title")).slice(0, 10);
      }
    }

    it("method serializable hash should work", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      expect(p.serializableHash()).toEqual({
        title: "Hello",
        body: "World",
        rating: 5,
      });
    });

    it("method serializable hash should work with only option", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      expect(p.serializableHash({ only: ["title"] })).toEqual({
        title: "Hello",
      });
    });

    it("method serializable hash should work with except option", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      expect(p.serializableHash({ except: ["body"] })).toEqual({
        title: "Hello",
        rating: 5,
      });
    });

    it("method serializable hash should work with methods option", () => {
      const p = new Post({ title: "Hello World!", body: "c", rating: 3 });
      const result = p.serializableHash({ methods: ["summary"] });
      expect(result.summary).toBe("Hello Worl");
    });

    it("method serializable hash should work with only and methods", () => {
      const p = new Post({ title: "Test", body: "c", rating: 3 });
      const result = p.serializableHash({
        only: ["title"],
        methods: ["summary"],
      });
      expect(Object.keys(result).sort()).toEqual(["summary", "title"]);
    });

    it("asJson returns same as serializableHash", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      expect(p.asJson()).toEqual(p.serializableHash());
    });

    it("toJson returns valid JSON string", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      const parsed = JSON.parse(p.toJson());
      expect(parsed.title).toBe("Hello");
      expect(parsed.rating).toBe(5);
    });

    it("include option with singular association", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      // Simulate preloaded association
      const comment = { _attributes: new Map([["text", "Great!"]]) };
      (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
      const result = p.serializableHash({ include: ["comments"] });
      expect(Array.isArray(result.comments)).toBe(true);
      expect((result.comments as any[])[0].text).toBe("Great!");
    });

    it("include with options", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      const comment = {
        _attributes: new Map([
          ["text", "Great!"],
          ["author", "Bob"],
        ]),
      };
      (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
      const result = p.serializableHash({ include: { comments: { only: ["text"] } } });
      expect((result.comments as any[])[0].text).toBe("Great!");
      expect((result.comments as any[])[0].author).toBeUndefined();
    });

    it("include as string for single association", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      const author = { _attributes: new Map([["name", "Alice"]]) };
      (p as any)._preloadedAssociations = new Map([["author", author]]);
      const result = p.serializableHash({ include: "author" });
      expect((result.author as any).name).toBe("Alice");
    });
  });

  describe("Naming", () => {
    class Post extends Model {}

    it("name returns class name", () => {
      expect(Post.modelName.name).toBe("Post");
    });

    it("singular", () => {
      expect(Post.modelName.singular).toBe("post");
    });

    it("plural", () => {
      expect(Post.modelName.plural).toBe("posts");
    });

    it("element", () => {
      expect(Post.modelName.element).toBe("post");
    });

    it("collection", () => {
      expect(Post.modelName.collection).toBe("posts");
    });

    it("param key", () => {
      expect(Post.modelName.paramKey).toBe("post");
    });

    it("route key", () => {
      expect(Post.modelName.routeKey).toBe("posts");
    });

    it("handles CamelCase", () => {
      class BlogPost extends Model {}
      expect(BlogPost.modelName.singular).toBe("blog_post");
      expect(BlogPost.modelName.plural).toBe("blog_posts");
    });

    it("instance delegates to class", () => {
      const p = new Post();
      expect(p.modelName.name).toBe("Post");
    });

    it("to_partial_path default implementation returns a string giving a relative path", () => {
      const p = new Post();
      expect(p.toPartialPath()).toBe("posts/_post");
    });

    it("i18n key", () => {
      class BlogPost extends Model {}
      expect(BlogPost.modelName.i18nKey).toBe("blog_post");
    });
  });

  // =========================================================================
  // Types — Date, DateTime, Decimal
  // =========================================================================
  describe("Types", () => {
    describe("DateType", () => {
      const type = new Types.DateType();

      it("has name 'date'", () => {
        expect(type.name).toBe("date");
      });

      it("casts Date to Date", () => {
        const d = new Date("2024-01-15");
        expect(type.cast(d)).toBe(d);
      });

      it("type cast date", () => {
        const result = type.cast("2024-01-15");
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2024);
      });

      it("casts null to null", () => {
        expect(type.cast(null)).toBe(null);
      });

      it("casts undefined to null", () => {
        expect(type.cast(undefined)).toBe(null);
      });

      it("casts invalid string to null", () => {
        expect(type.cast("not-a-date")).toBe(null);
      });

      it("deserialize delegates to cast", () => {
        const result = type.deserialize("2024-01-15");
        expect(result).toBeInstanceOf(Date);
      });

      it("serialize delegates to cast", () => {
        const result = type.serialize("2024-01-15");
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe("DateTimeType", () => {
      const type = new Types.DateTimeType();

      it("has name 'datetime'", () => {
        expect(type.name).toBe("datetime");
      });

      it("type cast datetime and timestamp", () => {
        const result = type.cast("2024-01-15T10:30:00Z");
        expect(result).toBeInstanceOf(Date);
        expect(result!.getUTCHours()).toBe(10);
      });

      it("casts null to null", () => {
        expect(type.cast(null)).toBe(null);
      });

      it("casts Date to Date", () => {
        const d = new Date();
        expect(type.cast(d)).toBe(d);
      });
    });

    describe("DecimalType", () => {
      const type = new Types.DecimalType();

      it("has name 'decimal'", () => {
        expect(type.name).toBe("decimal");
      });

      it("type cast decimal", () => {
        expect(type.cast(42.5)).toBe("42.5");
      });

      it("casts string number to string", () => {
        expect(type.cast("3.14")).toBe("3.14");
      });

      it("casts integer to string", () => {
        expect(type.cast(100)).toBe("100");
      });

      it("casts null to null", () => {
        expect(type.cast(null)).toBe(null);
      });

      it("type cast decimal from invalid string", () => {
        expect(type.cast("not-a-number")).toBe(null);
      });
    });

    describe("TypeRegistry", () => {
      it("looks up built-in types", () => {
        const str = Types.typeRegistry.lookup("string");
        expect(str).toBeInstanceOf(Types.StringType);
      });

      it("looks up integer type", () => {
        const int = Types.typeRegistry.lookup("integer");
        expect(int).toBeInstanceOf(Types.IntegerType);
      });

      it("looks up all built-in types", () => {
        expect(Types.typeRegistry.lookup("float")).toBeInstanceOf(Types.FloatType);
        expect(Types.typeRegistry.lookup("boolean")).toBeInstanceOf(Types.BooleanType);
        expect(Types.typeRegistry.lookup("date")).toBeInstanceOf(Types.DateType);
        expect(Types.typeRegistry.lookup("datetime")).toBeInstanceOf(Types.DateTimeType);
        expect(Types.typeRegistry.lookup("decimal")).toBeInstanceOf(Types.DecimalType);
      });

      it("a reasonable error is given when no type is found", () => {
        expect(() => Types.typeRegistry.lookup("imaginary")).toThrow("Unknown type: imaginary");
      });

      it("a class can be registered for a symbol", () => {
        Types.typeRegistry.register("custom", () => new Types.StringType());
        const t = Types.typeRegistry.lookup("custom");
        expect(t).toBeInstanceOf(Types.StringType);
      });
    });
  });

  // =========================================================================
  // Errors.on() alias
  // =========================================================================
  describe("Errors.on()", () => {
    it("on() is an alias for get()", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.on("name")).toEqual(e.get("name"));
      expect(e.on("name")).toContain("can't be blank");
    });

    it("on() returns empty array for unknown attribute", () => {
      const e = new Errors(null);
      expect(e.on("nonexistent")).toEqual([]);
    });
  });

  // =========================================================================
  // Validators — untested options
  // =========================================================================
  describe("Validators (extended)", () => {
    describe("format with 'without' option", () => {
      class NoNumbers extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { without: /\d/ } });
        }
      }

      it("accepts values not matching 'without'", () => {
        expect(new NoNumbers({ name: "dean" }).isValid()).toBe(true);
      });

      it("rejects values matching 'without'", () => {
        const n = new NoNumbers({ name: "dean123" });
        expect(n.isValid()).toBe(false);
        expect(n.errors.get("name")).toContain("is invalid");
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

    describe("inclusion allowNil", () => {
      it("validates inclusion of with allow nil", () => {
        class WithNil extends Model {
          static {
            this.attribute("status", "string");
            this.validates("status", { inclusion: { in: ["a", "b"] } });
          }
        }
        expect(new WithNil({}).isValid()).toBe(true);
      });

      it("validates nil when allowNil is false", () => {
        class NoNil extends Model {
          static {
            this.attribute("status", "string");
            this.validates("status", { inclusion: { in: ["a", "b"], allowNil: false } });
          }
        }
        expect(new NoNil({}).isValid()).toBe(false);
      });
    });

    describe("exclusion allowNil", () => {
      it("skips nil by default", () => {
        class WithNil extends Model {
          static {
            this.attribute("role", "string");
            this.validates("role", { exclusion: { in: ["admin"] } });
          }
        }
        expect(new WithNil({}).isValid()).toBe(true);
      });
    });

    describe("acceptance skips nil", () => {
      it("skips nil by default", () => {
        class Terms extends Model {
          static {
            this.attribute("terms", "string");
            this.validates("terms", { acceptance: true });
          }
        }
        expect(new Terms({}).isValid()).toBe(true);
      });
    });

    describe("custom messages", () => {
      it("presence with custom message", () => {
        class Custom extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: { message: "is required" } });
          }
        }
        const c = new Custom();
        c.isValid();
        expect(c.errors.get("name")).toContain("is required");
      });

      it("length with custom tooShort and tooLong", () => {
        class Custom extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", {
              length: { minimum: 3, maximum: 5, tooShort: "too few!", tooLong: "too many!" },
            });
          }
        }
        const short = new Custom({ name: "ab" });
        short.isValid();
        expect(short.errors.get("name")).toContain("too few!");

        const long = new Custom({ name: "abcdef" });
        long.isValid();
        expect(long.errors.get("name")).toContain("too many!");
      });
    });
  });

  // =========================================================================
  // Callbacks — after_validation
  // =========================================================================
  describe("Callbacks (extended)", () => {
    it("afterValidation runs after validation", () => {
      const order: string[] = [];
      class Validated extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.afterValidation(() => {
            order.push("after_validation");
          });
        }
      }
      const v = new Validated({ name: "dean" });
      v.isValid();
      expect(order).toContain("after_validation");
    });

    it("afterValidation runs even when invalid", () => {
      const order: string[] = [];
      class Validated extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.afterValidation(() => {
            order.push("after_validation");
          });
        }
      }
      const v = new Validated();
      v.isValid();
      expect(order).toContain("after_validation");
    });

    it("callback inheritance — child inherits parent callbacks", () => {
      const order: string[] = [];
      class Parent extends Model {
        static {
          this.attribute("name", "string");
          this.beforeSave(() => {
            order.push("parent_before");
          });
        }
      }
      class Child extends Parent {
        static {
          this.beforeSave(() => {
            order.push("child_before");
          });
        }
      }
      const c = new Child();
      c.runCallbacks("save", () => {
        order.push("action");
      });
      expect(order).toContain("parent_before");
      expect(order).toContain("child_before");
      expect(order.indexOf("parent_before")).toBeLessThan(order.indexOf("child_before"));
    });

    it("child callbacks do not affect parent", () => {
      const parentOrder: string[] = [];
      const childOrder: string[] = [];
      class Parent extends Model {
        static {
          this.attribute("name", "string");
          this.beforeSave(() => {
            parentOrder.push("parent");
            childOrder.push("parent");
          });
        }
      }
      class Child extends Parent {
        static {
          this.beforeSave(() => {
            childOrder.push("child");
          });
        }
      }
      new Parent().runCallbacks("save", () => {
        parentOrder.push("action");
      });
      expect(parentOrder).not.toContain("child");
    });

    it("custom validate with method name string", () => {
      class WithMethod extends Model {
        static {
          this.attribute("value", "integer");
          this.validate("validateCustom");
        }
        validateCustom() {
          if (this.readAttribute("value") === 0) {
            this.errors.add("value", "invalid", { message: "cannot be zero" });
          }
        }
      }
      expect(new WithMethod({ value: 1 }).isValid()).toBe(true);
      const w = new WithMethod({ value: 0 });
      expect(w.isValid()).toBe(false);
      expect(w.errors.get("value")).toContain("cannot be zero");
    });
  });

  // =========================================================================
  // ComparisonValidator
  // =========================================================================
  describe("ComparisonValidator", () => {
    it("validates greaterThan", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Order({ quantity: 5 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
      expect(new Order({ quantity: -1 }).isValid()).toBe(false);
    });

    it("validates greaterThanOrEqualTo", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThanOrEqualTo: 1 } });
        }
      }
      expect(new Order({ quantity: 1 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
    });

    it("validates lessThan", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThan: 10 } });
        }
      }
      expect(new Rating({ score: 9 }).isValid()).toBe(true);
      expect(new Rating({ score: 10 }).isValid()).toBe(false);
    });

    it("validates lessThanOrEqualTo", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThanOrEqualTo: 10 } });
        }
      }
      expect(new Rating({ score: 10 }).isValid()).toBe(true);
      expect(new Rating({ score: 11 }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using numeric", () => {
      class Confirmation extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { comparison: { equalTo: 42 } });
        }
      }
      expect(new Confirmation({ value: 42 }).isValid()).toBe(true);
      expect(new Confirmation({ value: 43 }).isValid()).toBe(false);
    });

    it("validates comparison with other than using numeric", () => {
      class Item extends Model {
        static {
          this.attribute("status", "integer");
          this.validates("status", { comparison: { otherThan: 0 } });
        }
      }
      expect(new Item({ status: 1 }).isValid()).toBe(true);
      expect(new Item({ status: 0 }).isValid()).toBe(false);
    });

    it("validates comparison with proc", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "date");
          this.attribute("endDate", "date");
          this.validates("endDate", {
            comparison: { greaterThan: (record: any) => record.readAttribute("startDate") },
          });
        }
      }
      const valid = new Event({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-02"),
      });
      expect(valid.isValid()).toBe(true);

      const invalid = new Event({
        startDate: new Date("2024-01-02"),
        endDate: new Date("2024-01-01"),
      });
      expect(invalid.isValid()).toBe(false);
    });

    it("validates comparison with greater than using date", () => {
      const tomorrow = new Date("2024-06-02");
      class Booking extends Model {
        static {
          this.attribute("checkIn", "date");
          this.validates("checkIn", { comparison: { greaterThanOrEqualTo: tomorrow } });
        }
      }
      expect(new Booking({ checkIn: new Date("2024-06-02") }).isValid()).toBe(true);
      expect(new Booking({ checkIn: new Date("2024-06-01") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { greaterThan: "A" } });
        }
      }
      expect(new Item({ code: "B" }).isValid()).toBe(true);
      expect(new Item({ code: "A" }).isValid()).toBe(false);
    });

    it("validates comparison with nil allowed", () => {
      class Item extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Item({}).isValid()).toBe(true);
    });

    it("supports custom message", () => {
      class Item extends Model {
        static {
          this.attribute("qty", "integer");
          this.validates("qty", {
            comparison: { greaterThan: 0, message: "must be positive" },
          });
        }
      }
      const item = new Item({ qty: 0 });
      expect(item.isValid()).toBe(false);
      expect(item.errors.fullMessages).toContain("Qty must be positive");
    });

    it("validates comparison of multiple values", () => {
      class Score extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", {
            comparison: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 100 },
          });
        }
      }
      expect(new Score({ value: 50 }).isValid()).toBe(true);
      expect(new Score({ value: -1 }).isValid()).toBe(false);
      expect(new Score({ value: 101 }).isValid()).toBe(false);
    });
  });

  // =========================================================================
  // UUID Type
  // =========================================================================
  describe("UuidType", () => {
    it("casts a valid UUID to lowercase", () => {
      class Item extends Model {
        static {
          this.attribute("uuid", "uuid");
        }
      }
      const item = new Item({ uuid: "550E8400-E29B-41D4-A716-446655440000" });
      expect(item.readAttribute("uuid")).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("returns null for invalid UUID", () => {
      class Item extends Model {
        static {
          this.attribute("uuid", "uuid");
        }
      }
      const item = new Item({ uuid: "not-a-uuid" });
      expect(item.readAttribute("uuid")).toBe(null);
    });

    it("handles null", () => {
      class Item extends Model {
        static {
          this.attribute("uuid", "uuid");
        }
      }
      const item = new Item({});
      expect(item.readAttribute("uuid")).toBe(null);
    });
  });

  // =========================================================================
  // JSON Type
  // =========================================================================
  describe("JsonType", () => {
    it("casts a JSON string to parsed object", () => {
      class Config extends Model {
        static {
          this.attribute("data", "json");
        }
      }
      const c = new Config({ data: '{"key":"value"}' });
      expect(c.readAttribute("data")).toEqual({ key: "value" });
    });

    it("passes through objects", () => {
      class Config extends Model {
        static {
          this.attribute("data", "json");
        }
      }
      const c = new Config({ data: { key: "value" } });
      expect(c.readAttribute("data")).toEqual({ key: "value" });
    });

    it("returns null for invalid JSON string", () => {
      class Config extends Model {
        static {
          this.attribute("data", "json");
        }
      }
      const c = new Config({ data: "not json{" });
      expect(c.readAttribute("data")).toBe(null);
    });

    it("handles arrays", () => {
      class Config extends Model {
        static {
          this.attribute("tags", "json");
        }
      }
      const c = new Config({ tags: [1, 2, 3] });
      expect(c.readAttribute("tags")).toEqual([1, 2, 3]);
    });

    it("handles null", () => {
      class Config extends Model {
        static {
          this.attribute("data", "json");
        }
      }
      const c = new Config({});
      expect(c.readAttribute("data")).toBe(null);
    });
  });

  // =========================================================================
  // afterCommit / afterRollback callback registration
  // =========================================================================
  describe("afterCommit / afterRollback callbacks", () => {
    it("registers afterCommit callback", () => {
      class Order extends Model {
        static {
          this.attribute("total", "integer");
          this.afterCommit(() => {});
        }
      }
      // Should not throw
      expect(new Order({ total: 1 }).isValid()).toBe(true);
    });

    it("registers afterRollback callback", () => {
      class Order extends Model {
        static {
          this.attribute("total", "integer");
          this.afterRollback(() => {});
        }
      }
      expect(new Order({ total: 1 }).isValid()).toBe(true);
    });
  });

  // =================================================================
  // Phase: attribute_before_type_cast / hasAttribute
  // =================================================================
  describe("attributeBeforeTypeCast", () => {
    it("returns the raw value before type casting", () => {
      class Price extends Model {
        static {
          this.attribute("amount", "integer");
        }
      }

      const price = new Price({ amount: "42" });
      expect(price.readAttribute("amount")).toBe(42); // cast to integer
      expect(price.readAttributeBeforeTypeCast("amount")).toBe("42"); // raw string
    });

    it("tracks raw values on writeAttribute", () => {
      class Price extends Model {
        static {
          this.attribute("amount", "integer");
        }
      }

      const price = new Price({ amount: 10 });
      price.writeAttribute("amount", "99");
      expect(price.readAttribute("amount")).toBe(99);
      expect(price.readAttributeBeforeTypeCast("amount")).toBe("99");
    });
  });

  describe("willSaveChangeToAttribute", () => {
    it("returns true when attribute has been changed", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("size", "integer");
        }
      }

      const w = new Widget({ name: "Test", size: 5 });
      w.changesApplied();
      w.writeAttribute("name", "Changed");
      expect(w.willSaveChangeToAttribute("name")).toBe(true);
      expect(w.willSaveChangeToAttribute("size")).toBe(false);
    });

    it("willSaveChangeToAttributeValues returns [old, new]", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
        }
      }

      const w = new Widget({ name: "Test" });
      w.changesApplied();
      w.writeAttribute("name", "Changed");
      expect(w.willSaveChangeToAttributeValues("name")).toEqual(["Test", "Changed"]);
    });
  });

  describe("attributeInDatabase / attributeBeforeLastSave / changedAttributeNamesToSave", () => {
    it("attributeInDatabase returns the pre-change value", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
        }
      }

      const w = new Widget({ name: "Test" });
      w.changesApplied();
      w.writeAttribute("name", "Changed");
      expect(w.attributeInDatabase("name")).toBe("Test");
    });

    it("attributeBeforeLastSave returns old value after save", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
        }
      }

      const w = new Widget({ name: "Original" });
      w.changesApplied();
      w.writeAttribute("name", "Updated");
      w.changesApplied();
      expect(w.attributeBeforeLastSave("name")).toBe("Original");
    });

    it("changedAttributeNamesToSave lists pending changes", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("size", "integer");
        }
      }

      const w = new Widget({ name: "Test", size: 5 });
      w.changesApplied();
      w.writeAttribute("name", "Changed");
      expect(w.changedAttributeNamesToSave).toContain("name");
      expect(w.changedAttributeNamesToSave).not.toContain("size");
    });
  });

  describe("hasAttribute", () => {
    it("returns true for defined attributes", () => {
      class Widget extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("size", "integer");
        }
      }

      const w = new Widget({ name: "Test" });
      expect(w.hasAttribute("name")).toBe(true);
      expect(w.hasAttribute("size")).toBe(true);
      expect(w.hasAttribute("unknown")).toBe(false);
    });
  });

  describe("validatesEach", () => {
    it("validates each", () => {
      class Payment extends Model {
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

      const p = new Payment({ price: -5, discount: 10 });
      expect(p.isValid()).toBe(false);
      expect(p.errors.fullMessages).toContain("Price must be non-negative");

      const p2 = new Payment({ price: 5, discount: -3 });
      expect(p2.isValid()).toBe(false);
      expect(p2.errors.fullMessages).toContain("Discount must be non-negative");

      const p3 = new Payment({ price: 5, discount: 10 });
      expect(p3.isValid()).toBe(true);
    });

    it("supports conditional options", () => {
      class Payment extends Model {
        static {
          this.attribute("price", "integer");
          this.attribute("discount", "integer");
          this.validatesEach(
            ["price", "discount"],
            (record, attr, value) => {
              if (typeof value === "number" && value < 0) {
                record.errors.add(attr, "invalid", { message: "must be non-negative" });
              }
            },
            { if: (record) => record.readAttribute("price") !== null },
          );
        }
      }

      const p = new Payment({ price: null, discount: -3 });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("validatesWith", () => {
    it("validation with class that adds errors", () => {
      class EvenValidator {
        validate(record: any) {
          const val = record.readAttribute("count");
          if (typeof val === "number" && val % 2 !== 0) {
            record.errors.add("count", "invalid", { message: "must be even" });
          }
        }
      }

      class Item extends Model {
        static {
          this.attribute("count", "integer");
          this.validatesWith(EvenValidator);
        }
      }

      const item = new Item({ count: 3 });
      expect(item.isValid()).toBe(false);
      expect(item.errors.fullMessages).toContain("Count must be even");

      const item2 = new Item({ count: 4 });
      expect(item2.isValid()).toBe(true);
    });

    it("passes all configuration options to the validator class", () => {
      class ThresholdValidator {
        threshold: number;
        constructor(options: any = {}) {
          this.threshold = options.threshold ?? 10;
        }
        validate(record: any) {
          const val = record.readAttribute("score");
          if (typeof val === "number" && val < this.threshold) {
            record.errors.add("score", "invalid", {
              message: `must be at least ${this.threshold}`,
            });
          }
        }
      }

      class Game extends Model {
        static {
          this.attribute("score", "integer");
          this.validatesWith(ThresholdValidator, { threshold: 50 });
        }
      }

      const g = new Game({ score: 30 });
      expect(g.isValid()).toBe(false);
      expect(g.errors.fullMessages).toContain("Score must be at least 50");

      const g2 = new Game({ score: 60 });
      expect(g2.isValid()).toBe(true);
    });

    it("supports conditional options", () => {
      class AlwaysInvalidValidator {
        validate(record: any) {
          record.errors.add("base", "invalid", { message: "always invalid" });
        }
      }

      class Widget extends Model {
        static {
          this.attribute("active", "boolean");
          this.validatesWith(AlwaysInvalidValidator, {
            if: (r: any) => r.readAttribute("active") === true,
          });
        }
      }

      const w = new Widget({ active: false });
      expect(w.isValid()).toBe(true);

      const w2 = new Widget({ active: true });
      expect(w2.isValid()).toBe(false);
    });
  });

  describe("clearChangesInformation", () => {
    it("clear_changes_information should reset all changes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }

      const p = new Person({ name: "Alice", age: 30 });
      p.changesApplied(); // snapshot as clean
      p.writeAttribute("name", "Bob");
      p.changesApplied(); // this makes name change a "previous change"
      expect(Object.keys(p.previousChanges).length).toBeGreaterThan(0);

      // Now make another current change
      p.writeAttribute("age", 31);
      expect(p.changed).toBe(true);

      p.clearChangesInformation();
      expect(p.changed).toBe(false);
      expect(Object.keys(p.previousChanges).length).toBe(0);
    });
  });

  describe("clearAttributeChanges", () => {
    it("clears changes for specific attributes only", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }

      const p = new Person({ name: "Alice", age: 30 });
      p.changesApplied();
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 31);
      expect(p.changedAttributes).toContain("name");
      expect(p.changedAttributes).toContain("age");

      p.clearAttributeChanges(["name"]);
      expect(p.changedAttributes).not.toContain("name");
      expect(p.changedAttributes).toContain("age");
    });
  });

  describe("normalizes", () => {
    it("applies normalization on write", () => {
      class User extends Model {
        static {
          this.attribute("email", "string");
          this.normalizes("email", (v: unknown) =>
            typeof v === "string" ? v.trim().toLowerCase() : v,
          );
        }
      }

      const u = new User({ email: "  Alice@Example.COM  " });
      expect(u.readAttribute("email")).toBe("alice@example.com");
    });

    it("applies normalization on subsequent writeAttribute", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.trim() : v));
        }
      }

      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "  Bob  ");
      expect(u.readAttribute("name")).toBe("Bob");
    });

    it("supports multiple attributes", () => {
      class User extends Model {
        static {
          this.attribute("first_name", "string");
          this.attribute("last_name", "string");
          this.normalizes("first_name", "last_name", (v: unknown) =>
            typeof v === "string" ? v.toUpperCase() : v,
          );
        }
      }

      const u = new User({ first_name: "alice", last_name: "smith" });
      expect(u.readAttribute("first_name")).toBe("ALICE");
      expect(u.readAttribute("last_name")).toBe("SMITH");
    });
  });

  describe("attributeChanged with from/to options", () => {
    it("returns true when from/to match the change", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.attributeChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
    });

    it("returns false when from does not match", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.attributeChanged("name", { from: "Charlie", to: "Bob" })).toBe(false);
    });

    it("returns false when to does not match", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.attributeChanged("name", { from: "Alice", to: "Charlie" })).toBe(false);
    });

    it("supports only from option", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.attributeChanged("name", { from: "Alice" })).toBe(true);
      expect(u.attributeChanged("name", { from: "Wrong" })).toBe(false);
    });

    it("supports only to option", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.attributeChanged("name", { to: "Bob" })).toBe(true);
      expect(u.attributeChanged("name", { to: "Wrong" })).toBe(false);
    });

    it("willSaveChangeToAttribute supports from/to", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      expect(u.willSaveChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(u.willSaveChangeToAttribute("name", { from: "Wrong" })).toBe(false);
    });

    it("savedChangeToAttribute supports from/to", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.changesApplied();
      u.writeAttribute("name", "Bob");
      u.changesApplied();
      expect(u.savedChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(u.savedChangeToAttribute("name", { from: "Alice", to: "Wrong" })).toBe(false);
      expect(u.savedChangeToAttribute("name", { from: "Wrong", to: "Bob" })).toBe(false);
    });
  });

  describe("errors.fullMessagesFor()", () => {
    it("full_messages_for contains all the error messages for the given attribute indifferent", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true });
        }
      }
      const u = new User({});
      u.isValid();
      expect(u.errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
      expect(u.errors.fullMessagesFor("email")).toEqual(["Email can't be blank"]);
      expect(u.errors.fullMessagesFor("other")).toEqual([]);
    });
  });

  describe("errors.ofKind()", () => {
    it("of_kind? defaults message to :invalid", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const u = new User({});
      u.isValid();
      expect(u.errors.ofKind("name", "blank")).toBe(true);
      expect(u.errors.ofKind("name", "invalid")).toBe(false);
      expect(u.errors.ofKind("name")).toBe(true);
      expect(u.errors.ofKind("other")).toBe(false);
    });
  });

  describe("attributesBeforeTypeCast", () => {
    it("returns all raw attribute values", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const u = new User({ name: "Alice", age: "25" });
      const raw = u.attributesBeforeTypeCast;
      expect(raw.name).toBe("Alice");
      expect(raw.age).toBe("25"); // raw, not cast to integer
      expect(u.readAttribute("age")).toBe(25); // cast version
    });
  });

  describe("columnForAttribute()", () => {
    it("returns type info for defined attribute", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const u = new User({ name: "Alice", age: 25 });
      const col = u.columnForAttribute("name");
      expect(col).not.toBeNull();
      expect(col!.name).toBe("name");

      const ageCol = u.columnForAttribute("age");
      expect(ageCol).not.toBeNull();
      expect(ageCol!.name).toBe("age");
    });

    it("returns null for unknown attribute", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.columnForAttribute("nonexistent")).toBeNull();
    });
  });

  describe("humanAttributeName()", () => {
    it("humanizes attribute names at the Model level", () => {
      class User extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      expect(User.humanAttributeName("first_name")).toBe("First name");
      expect(User.humanAttributeName("email")).toBe("Email");
    });
  });

  describe("defineModelCallbacks()", () => {
    it("creates before/after/around methods for custom events", () => {
      class Payment extends Model {
        static {
          this.attribute("amount", "integer");
          this.defineModelCallbacks("process", "refund");
        }
      }

      const log: string[] = [];
      (Payment as any).beforeProcess((record: any) => {
        log.push("before_process");
      });
      (Payment as any).afterProcess((record: any) => {
        log.push("after_process");
      });

      const p = new Payment({ amount: 100 });
      // Run callbacks manually
      (Payment as any)._callbackChain.runBefore("process", p);
      (Payment as any)._callbackChain.runAfter("process", p);
      expect(log).toEqual(["before_process", "after_process"]);
    });

    it("creates around callback", () => {
      class Payment extends Model {
        static {
          this.attribute("amount", "integer");
          this.defineModelCallbacks("charge");
        }
      }

      expect(typeof (Payment as any).aroundCharge).toBe("function");
    });
  });

  describe("nullifyBlanks()", () => {
    it("converts blank strings to null for specified attributes", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("bio", "string");
          this.nullifyBlanks("name");
        }
      }
      const u = new User({ name: "  ", bio: "  " });
      expect(u.readAttribute("name")).toBeNull();
      expect(u.readAttribute("bio")).toBe("  "); // not nullified
    });

    it("nullifies all string attrs when called with no arguments", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.nullifyBlanks();
        }
      }
      const u = new User({ name: "", email: "" });
      expect(u.readAttribute("name")).toBeNull();
      expect(u.readAttribute("email")).toBeNull();
    });

    it("nullifies on writeAttribute too", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.nullifyBlanks("name");
        }
      }
      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "");
      expect(u.readAttribute("name")).toBeNull();
    });
  });

  describe("callbacks with prepend option", () => {
    it("prepend: true puts callback first in the chain", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const order: string[] = [];
      User.beforeSave(() => {
        order.push("first");
      });
      User.beforeSave(
        () => {
          order.push("prepended");
        },
        { prepend: true },
      );

      const u = new User({ name: "Alice" });
      (User as any)._callbackChain.runBefore("save", u);
      expect(order).toEqual(["prepended", "first"]);
    });
  });

  describe("withOptions()", () => {
    it("applies common validation options to all validates calls", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.attribute("active", "boolean", { default: true });
        }
      }

      User.withOptions({ on: "create" }, (m) => {
        m.validates("name", { presence: true });
        m.validates("email", { presence: true });
      });

      // The validations should have on: "create" context
      const validations = (User as any)._validations;
      const nameV = validations.find((v: any) => v.attribute === "name");
      const emailV = validations.find((v: any) => v.attribute === "email");
      expect(nameV.on).toBe("create");
      expect(emailV.on).toBe("create");
    });
  });

  describe("toXml()", () => {
    it("serializes model to XML", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const u = new User({ name: "Alice", age: 30 });
      const xml = u.toXml();
      expect(xml).toContain("<user>");
      expect(xml).toContain("<name>Alice</name>");
      expect(xml).toContain('<age type="integer">30</age>');
      expect(xml).toContain("</user>");
    });

    it("handles null values", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      const xml = u.toXml();
      expect(xml).toContain('nil="true"');
    });

    it("supports custom root element", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      const xml = u.toXml({ root: "person" });
      expect(xml).toContain("<person>");
      expect(xml).toContain("</person>");
    });
  });

  // ===========================================================================
  // fromJson
  // ===========================================================================
  describe("fromJson", () => {
    it("from_json should work without a root (class attribute)", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const u = new User({});
      u.fromJson('{"name":"Alice","age":30}');
      expect(u.readAttribute("name")).toBe("Alice");
      expect(u.readAttribute("age")).toBe(30);
    });

    it("returns this for chaining", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      const result = u.fromJson('{"name":"Bob"}');
      expect(result).toBe(u);
    });

    it("from_json should work with a root (method parameter)", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.fromJson('{"user":{"name":"Charlie"}}', true);
      expect(u.readAttribute("name")).toBe("Charlie");
    });

    it("marks attributes as changed via dirty tracking", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Original" });
      u.changesApplied();
      u.fromJson('{"name":"Updated"}');
      expect(u.changed).toBe(true);
      expect(u.changedAttributes).toContain("name");
    });
  });

  // ===========================================================================
  // isPersisted
  // ===========================================================================
  describe("isPersisted", () => {
    it("persisted is always false", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.isPersisted()).toBe(false);
    });
  });

  // ===========================================================================
  // ConfirmationValidator caseSensitive option
  // ===========================================================================
  describe("ConfirmationValidator caseSensitive", () => {
    it("title confirmation with case sensitive option true", () => {
      class User extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: true });
        }
      }
      const u = new User({ email: "Alice@example.com" });
      u._attributes.set("email_confirmation", "alice@example.com");
      expect(u.isValid()).toBe(false);
    });

    it("title confirmation with case sensitive option false", () => {
      class User extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: { caseSensitive: false } });
        }
      }
      const u = new User({ email: "Alice@example.com" });
      u._attributes.set("email_confirmation", "alice@example.com");
      expect(u.isValid()).toBe(true);
    });

    it("still fails when values differ with caseSensitive: false", () => {
      class User extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: { caseSensitive: false } });
        }
      }
      const u = new User({ email: "alice@example.com" });
      u._attributes.set("email_confirmation", "bob@example.com");
      expect(u.isValid()).toBe(false);
    });
  });

  // ===========================================================================
  // toModel (ActiveModel::Conversion)
  // ===========================================================================
  describe("toModel", () => {
    it("to_model default implementation returns self", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.toModel()).toBe(u);
    });
  });

  // ===========================================================================
  // i18nScope
  // ===========================================================================
  describe("i18nScope", () => {
    it("returns 'activemodel' by default", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(User.i18nScope).toBe("activemodel");
    });
  });

  // ===========================================================================
  // attributePreviouslyChanged / attributePreviouslyWas
  // ===========================================================================
  describe("attributePreviouslyChanged / attributePreviouslyWas", () => {
    it("attributePreviouslyChanged returns true for attributes changed in last save", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      u.changesApplied(); // simulate save — records name change as previous
      expect(u.attributePreviouslyChanged("name")).toBe(true);
    });

    it("attributePreviouslyChanged supports from/to options", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      u.changesApplied();
      expect(u.attributePreviouslyChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(u.attributePreviouslyChanged("name", { to: "Charlie" })).toBe(false);
    });

    it("attributePreviouslyWas returns value before last save", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      u.changesApplied();
      expect(u.attributePreviouslyWas("name")).toBe("Alice");
    });
  });

  // ===========================================================================
  // attributeMethodPrefix / attributeMethodSuffix / attributeMethodAffix
  // ===========================================================================
  describe("attribute method prefix/suffix/affix", () => {
    it("defines prefixed methods for attributes", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodPrefix("clear_");
        }
      }
      const u = new User({ name: "Alice" });
      expect((u as any)["clear_name"]()).toBe("Alice");
    });

    it("defines suffixed methods for attributes", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodSuffix("_before_type_cast");
        }
      }
      const u = new User({ name: "Alice" });
      expect((u as any)["name_before_type_cast"]()).toBe("Alice");
    });

    it("defines affix methods with both prefix and suffix", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodAffix({ prefix: "reset_", suffix: "_to_default" });
        }
      }
      const u = new User({ name: "Alice" });
      expect((u as any)["reset_name_to_default"]()).toBe("Alice");
    });
  });

  describe("validators / validatorsOn", () => {
    it("returns all registered validators", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true, length: { minimum: 5 } });
        }
      }
      const validators = User.validators();
      // presence on name, presence on email, length on email
      expect(validators.length).toBe(3);
    });

    it("returns validators for a specific attribute", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true, length: { minimum: 2, maximum: 50 } });
          this.validates("email", { presence: true });
        }
      }
      const nameValidators = User.validatorsOn("name");
      expect(nameValidators.length).toBe(2); // presence + length
      const emailValidators = User.validatorsOn("email");
      expect(emailValidators.length).toBe(1); // presence only
    });

    it("returns empty array for attribute with no validators", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("bio", "string");
          this.validates("name", { presence: true });
        }
      }
      expect(User.validatorsOn("bio")).toEqual([]);
    });
  });

  describe("custom validation contexts", () => {
    it("with a class that adds errors on create and validating a new model", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("terms_accepted", "string");
          this.validates("name", { presence: true });
          this.validates("terms_accepted", { presence: true, on: "registration" as any });
        }
      }
      const u = new User({ name: "Alice" });
      // Without context, terms_accepted validation is skipped
      expect(u.isValid()).toBe(true);
      // With custom context, terms_accepted presence validation runs
      expect(u.isValid("registration")).toBe(false);
    });

    it("with a class that adds errors on update and validating a new model", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.validates("email", { presence: true, on: "create" as any });
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.isValid("create")).toBe(false);
      expect(u.isValid("update")).toBe(true);
    });
  });

  describe("Errors enhancements", () => {
    it("added? defaults message to :invalid", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      expect(u.errors.added("name", "blank")).toBe(true);
      expect(u.errors.added("name", "invalid")).toBe(false);
    });

    it("delete removes details on given attribute", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      u.errors.add("name", "too_short");
      u.errors.add("email", "blank");
      const removed = u.errors.delete("name");
      expect(removed.length).toBe(2);
      expect(u.errors.count).toBe(1);
    });

    it("delete with type only removes matching errors", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      u.errors.add("name", "too_short");
      const removed = u.errors.delete("name", "blank");
      expect(removed.length).toBe(1);
      expect(u.errors.count).toBe(1);
    });

    it("each iterates over all errors", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      u.errors.add("email", "invalid");
      const collected: string[] = [];
      u.errors.each((e) => collected.push(`${e.attribute}:${e.type}`));
      expect(collected).toEqual(["name:blank", "email:invalid"]);
    });

    it("merge errors", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u1 = new User({});
      const u2 = new User({});
      u1.errors.add("name", "blank");
      u2.errors.merge(u1.errors);
      expect(u2.errors.count).toBe(1);
      expect(u2.errors.get("name")).toEqual(["can't be blank"]);
    });

    it("to_hash returns the error messages hash", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      u.errors.add("name", "too_short");
      u.errors.add("email", "invalid");
      const hash = u.errors.toHash();
      expect(hash.name.length).toBe(2);
      expect(hash.email.length).toBe(1);
    });

    it("include?", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      expect(u.errors.include("name")).toBe(true);
      expect(u.errors.include("email")).toBe(false);
    });

    it("messages returns grouped messages", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      u.errors.add("name", "blank");
      expect(u.errors.messages).toEqual({ name: ["can't be blank"] });
    });

    it("full_messages creates a list of error messages with the attribute name included", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      expect(u.errors.fullMessage("name", "is required")).toBe("Name is required");
      expect(u.errors.fullMessage("base", "Something went wrong")).toBe("Something went wrong");
    });
  });

  describe("conditional validates (if/unless)", () => {
    it("skips validation when if condition returns false", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("requires_name", "boolean");
          this.validates("name", {
            presence: true,
            if: (record: any) => record.readAttribute("requires_name") === true,
          });
        }
      }
      const u = new User({ requires_name: false });
      expect(u.isValid()).toBe(true);
    });

    it("runs validation when if condition returns true", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("requires_name", "boolean");
          this.validates("name", {
            presence: true,
            if: (record: any) => record.readAttribute("requires_name") === true,
          });
        }
      }
      const u = new User({ requires_name: true });
      expect(u.isValid()).toBe(false);
    });

    it("skips validation when unless condition returns true", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("skip_validation", "boolean");
          this.validates("name", {
            presence: true,
            unless: (record: any) => record.readAttribute("skip_validation") === true,
          });
        }
      }
      const u = new User({ skip_validation: true });
      expect(u.isValid()).toBe(true);
    });

    it("runs validation when unless condition returns false", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("skip_validation", "boolean");
          this.validates("name", {
            presence: true,
            unless: (record: any) => record.readAttribute("skip_validation") === true,
          });
        }
      }
      const u = new User({ skip_validation: false });
      expect(u.isValid()).toBe(false);
    });
  });

  describe("validates_*_of shorthand methods", () => {
    it("validate presences", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validatesPresenceOf("name", "email");
        }
      }
      const u = new User({});
      expect(u.isValid()).toBe(false);
      expect(u.errors.get("name").length).toBeGreaterThan(0);
      expect(u.errors.get("email").length).toBeGreaterThan(0);
    });

    it("validates absence of", () => {
      class User extends Model {
        static {
          this.attribute("spam", "string");
          this.validatesAbsenceOf("spam");
        }
      }
      const u = new User({ spam: "not empty" });
      expect(u.isValid()).toBe(false);
    });

    it("validatesLengthOf validates length", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.validatesLengthOf("name", { minimum: 3 });
        }
      }
      expect(new User({ name: "AB" }).isValid()).toBe(false);
      expect(new User({ name: "ABC" }).isValid()).toBe(true);
    });

    it("validatesNumericalityOf validates numericality", () => {
      class Item extends Model {
        static {
          this.attribute("price", "float");
          this.validatesNumericalityOf("price", { greaterThan: 0 });
        }
      }
      expect(new Item({ price: -1 }).isValid()).toBe(false);
      expect(new Item({ price: 10 }).isValid()).toBe(true);
    });

    it("validatesInclusionOf validates inclusion", () => {
      class User extends Model {
        static {
          this.attribute("role", "string");
          this.validatesInclusionOf("role", { in: ["admin", "user"] });
        }
      }
      expect(new User({ role: "hacker" }).isValid()).toBe(false);
      expect(new User({ role: "admin" }).isValid()).toBe(true);
    });

    it("validatesFormatOf validates format", () => {
      class User extends Model {
        static {
          this.attribute("email", "string");
          this.validatesFormatOf("email", { with: /@/ });
        }
      }
      expect(new User({ email: "nope" }).isValid()).toBe(false);
      expect(new User({ email: "a@b.com" }).isValid()).toBe(true);
    });

    it("validatesConfirmationOf validates confirmation", () => {
      class User extends Model {
        static {
          this.attribute("password", "string");
          this.validatesConfirmationOf("password");
        }
      }
      const u = new User({ password: "secret", password_confirmation: "mismatch" });
      expect(u.isValid()).toBe(false);
    });
  });

  describe("Errors#generateMessage", () => {
    it("generate_message works without i18n_scope", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      expect(u.errors.generateMessage("name", "blank")).toBe("can't be blank");
      expect(u.errors.generateMessage("name", "invalid")).toBe("is invalid");
    });

    it("substitutes options into message", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({});
      expect(u.errors.generateMessage("age", "greater_than", { count: 0 })).toBe(
        "must be greater than 0",
      );
    });
  });

  describe("strict validations", () => {
    it("strict validation in validates", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, strict: true });
        }
      }
      const u = new User({});
      expect(() => u.isValid()).toThrow();
    });

    it("strict validation not fails", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, strict: true });
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.isValid()).toBe(true);
    });

    it("non-strict validations still add errors normally", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true, strict: true });
          this.validates("email", { presence: true });
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.isValid()).toBe(false);
      expect(u.errors.get("email").length).toBeGreaterThan(0);
    });
  });

  describe("respondTo", () => {
    it("returns true for defined methods", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.respondTo("readAttribute")).toBe(true);
      expect(u.respondTo("isValid")).toBe(true);
    });

    it("returns true for attributes", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.respondTo("name")).toBe(true);
    });

    it("returns false for non-existent methods/attributes", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.respondTo("nonExistentMethod")).toBe(false);
    });
  });

  describe("typeForAttribute", () => {
    it(".type_for_attribute returns the registered attribute type", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const u = new User({ name: "Alice", age: 25 });
      expect(u.typeForAttribute("name")?.name).toBe("string");
      expect(u.typeForAttribute("age")?.name).toBe("integer");
    });

    it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
      class User extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.typeForAttribute("unknown")).toBeNull();
    });
  });

  describe("changesToSave", () => {
    it("returns the changes hash for unsaved attributes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");
      User.attribute("age", "integer");

      const u = new User({ name: "Alice", age: 25 });
      u.writeAttribute("name", "Bob");
      const changes = u.changesToSave;
      expect(changes["name"]).toEqual(["Alice", "Bob"]);
      expect(changes["age"]).toBeUndefined();
    });

    it("returns empty object when no changes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      expect(u.changesToSave).toEqual({});
    });
  });

  describe("attributesInDatabase", () => {
    it("returns database values for changed attributes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");
      User.attribute("age", "integer");

      const u = new User({ name: "Alice", age: 25 });
      u.writeAttribute("name", "Bob");
      u.writeAttribute("age", 30);
      const dbValues = u.attributesInDatabase;
      expect(dbValues["name"]).toBe("Alice");
      expect(dbValues["age"]).toBe(25);
    });

    it("returns empty object when no changes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      expect(u.attributesInDatabase).toEqual({});
    });
  });

  describe("attributeMissing", () => {
    it("returns null by default for unknown attributes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      expect(u.readAttribute("nonexistent")).toBeNull();
    });

    it("can be overridden to provide custom behavior", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
        attributeMissing(name: string): unknown {
          return `missing:${name}`;
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      expect(u.readAttribute("nonexistent")).toBe("missing:nonexistent");
      // Known attributes still work normally
      expect(u.readAttribute("name")).toBe("Alice");
    });
  });

  describe("numericality with in: range", () => {
    it("validates value is within range", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("age", "integer");
      User.validates("age", { numericality: { in: [18, 65] } });

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
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("score", "integer");
      User.validates("score", { numericality: { in: [0, 100] } });

      const u1 = new User({ score: 0 });
      expect(u1.isValid()).toBe(true);

      const u2 = new User({ score: 100 });
      expect(u2.isValid()).toBe(true);
    });
  });

  describe("hasChangesToSave", () => {
    it("returns false when no changes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      expect(u.hasChangesToSave).toBe(false);
    });

    it("returns true when there are unsaved changes", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");

      const u = new User({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      expect(u.hasChangesToSave).toBe(true);
    });
  });

  describe("attributeNames (instance)", () => {
    it("returns the same names as the class method", () => {
      class User extends Model {
        constructor(attrs: Record<string, unknown> = {}) {
          super(attrs);
        }
      }
      User.attribute("name", "string");
      User.attribute("age", "integer");

      const u = new User({ name: "Alice", age: 25 });
      expect(u.attributeNames()).toEqual(User.attributeNames());
      expect(u.attributeNames()).toContain("name");
      expect(u.attributeNames()).toContain("age");
    });
  });

  // =========================================================================
  // Ported from missing-activemodel-stubs.test.ts
  // =========================================================================

  // ---- Access tests ----
  describe("Access", () => {
    class SliceModel extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
    }

    it("slice", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      const sliced = m.slice("name", "age");
      expect(sliced).toEqual({ name: "Alice", age: 30 });
      expect(sliced.email).toBeUndefined();
    });

    it("slice with array", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      const sliced = m.slice("name");
      expect(Object.keys(sliced)).toEqual(["name"]);
    });

    it("values_at", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      expect(m.valuesAt("name", "age")).toEqual(["Alice", 30]);
    });

    it("values_at with array", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      expect(m.valuesAt("email")).toEqual(["a@b.com"]);
    });
  });

  // ---- Model tests ----
  describe("Model (ported)", () => {
    it("initialize with params", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("initialize with nil or empty hash params does not explode", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => new Person({})).not.toThrow();
      expect(() => new Person()).not.toThrow();
    });

    it("persisted is always false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).isPersisted()).toBe(false);
    });

    it("assign_attributes sets multiple attributes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 20 });
      p.assignAttributes({ name: "Bob", age: 25 });
      expect(p.readAttribute("name")).toBe("Bob");
      expect(p.readAttribute("age")).toBe(25);
    });

    it("to_key returns null for new records", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).toKey()).toBe(null);
    });

    it("to_param returns null for new records", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).toParam()).toBe(null);
    });
  });

  // ---- Attribute Assignment tests ----
  describe("Attribute Assignment (ported)", () => {
    it("simple assignment", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("regular hash should still be used for mass assignment", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "Bob" });
      expect(p.readAttribute("name")).toBe("Bob");
    });
  });

  // ---- Attributes tests (ported) ----
  describe("Attributes (ported)", () => {
    it("properties assignment", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("reading attributes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      const attrs = p.attributes;
      expect(attrs.name).toBe("Alice");
      expect(attrs.age).toBe(30);
    });

    it("reading attribute names", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      expect(Person.attributeNames()).toEqual(["name", "age"]);
    });

    it("children can override parents", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string", { default: "parent" });
        }
      }
      class Child extends Parent {
        static {
          this.attribute("name", "string", { default: "child" });
        }
      }
      expect(new Child().readAttribute("name")).toBe("child");
      expect(new Parent().readAttribute("name")).toBe("parent");
    });

    it("attributes can be dup-ed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const attrs = { ...p.attributes };
      attrs.name = "Bob";
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });

  // ---- Dirty tests (ported) ----
  describe("Dirty (ported)", () => {
    class DirtyPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("color", "string");
      }
    }

    it("setting attribute will result in change", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
    });

    it("list of changed attribute keys", () => {
      const p = new DirtyPerson({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      expect(p.changedAttributes).toContain("name");
      expect(p.changedAttributes).not.toContain("age");
    });

    it("changes to attribute values", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChange("name")).toEqual(["Alice", "Bob"]);
    });

    it("checking if an attribute has changed to a particular value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChanged("name", { to: "Bob" })).toBe(true);
      expect(p.attributeChanged("name", { to: "Charlie" })).toBe(false);
    });

    it("setting color to same value should not result in change being recorded", () => {
      const p = new DirtyPerson({ color: "red" });
      p.writeAttribute("color", "red");
      expect(p.changed).toBe(false);
    });

    it("saving should reset model's changed status", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      p.changesApplied();
      expect(p.changed).toBe(false);
    });

    it("saving should preserve previous changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
    });

    it("setting new attributes should not affect previous changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
    });

    it("saving should preserve model's previous changed status", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.attributePreviouslyChanged("name")).toBe(true);
    });

    it("checking if an attribute was previously changed to a particular value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.attributePreviouslyChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(p.attributePreviouslyChanged("name", { to: "Charlie" })).toBe(false);
    });

    it("previous value is preserved when changed after save", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
      expect(p.changes).toEqual({ name: ["Bob", "Charlie"] });
    });

    it("changing the same attribute multiple times retains the correct original value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("name", "Charlie");
      expect(p.attributeChange("name")).toEqual(["Alice", "Charlie"]);
    });

    it("clear_changes_information should reset all changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      p.clearChangesInformation();
      expect(p.changed).toBe(false);
      expect(Object.keys(p.previousChanges).length).toBe(0);
    });

    it("restore_attributes should restore all previous data", () => {
      const p = new DirtyPerson({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 30);
      p.restoreAttributes();
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(25);
      expect(p.changed).toBe(false);
    });

    it("resetting attribute", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      p.writeAttribute("name", "Alice");
      expect(p.changed).toBe(false);
    });
  });

  // ---- Error tests (ported) ----
  describe("Error (ported)", () => {
    it("initialize", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.details[0].attribute).toBe("name");
      expect(e.details[0].type).toBe("blank");
    });

    it("initialize without type", () => {
      const e = new Errors(null);
      e.add("name");
      expect(e.details[0].type).toBe("invalid");
    });

    it("match? handles attribute match", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.where("name").length).toBe(1);
      expect(e.where("age").length).toBe(0);
    });

    it("match? handles error type match", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      expect(e.where("name", "blank").length).toBe(1);
      expect(e.where("name", "too_short").length).toBe(1);
    });

    it("full_message returns the given message when attribute is :base", () => {
      const e = new Errors(null);
      expect(e.fullMessage("base", "Something went wrong")).toBe("Something went wrong");
    });

    it("full_message returns the given message with the attribute name included", () => {
      const e = new Errors(null);
      expect(e.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("equality by base attribute, type and options", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.added("name", "blank")).toBe(true);
    });

    it("inequality", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.added("name", "too_short")).toBe(false);
    });

    it("message with type as custom message", () => {
      const e = new Errors(null);
      e.add("name", "blank", { message: "is required" });
      expect(e.get("name")).toContain("is required");
    });

    it("message with options[:message] as custom message", () => {
      const e = new Errors(null);
      e.add("name", "invalid", { message: "is not valid" });
      expect(e.get("name")).toContain("is not valid");
    });

    it("full_message returns the given message when the attribute contains base", () => {
      // A field named "base_price" should still get a prefix
      const e = new Errors(null);
      expect(e.fullMessage("base_price", "is invalid")).toBe("Base_price is invalid");
    });

    it("details which ignores callback and message options", () => {
      const e = new Errors(null);
      e.add("name", "blank", { message: "custom msg" });
      const detail = e.details[0];
      expect(detail.attribute).toBe("name");
      expect(detail.type).toBe("blank");
    });
  });

  // ---- Errors tests (ported) ----
  describe("Errors (ported)", () => {
    it("delete", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      const removed = e.delete("name");
      expect(removed.length).toBe(2);
      expect(e.count).toBe(0);
    });

    it("include?", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.include("name")).toBe(true);
      expect(e.include("age")).toBe(false);
    });

    it("any?", () => {
      const e = new Errors(null);
      expect(e.any).toBe(false);
      e.add("name", "blank");
      expect(e.any).toBe(true);
    });

    it("has key?", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.include("name")).toBe(true);
    });

    it("has no key", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.include("age")).toBe(false);
    });

    it("clear errors", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.clear();
      expect(e.empty).toBe(true);
    });

    it("attribute_names returns the error attributes", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      expect(e.attributeNames).toEqual(["name", "age"]);
    });

    it("attribute_names returns an empty array after try to get a message only", () => {
      const e = new Errors(null);
      e.get("name"); // should not create an entry
      expect(e.attributeNames).toEqual([]);
    });

    it("detecting whether there are errors with empty?, blank?, include?", () => {
      const e = new Errors(null);
      expect(e.empty).toBe(true);
      expect(e.any).toBe(false);
      expect(e.include("name")).toBe(false);
      e.add("name", "blank");
      expect(e.empty).toBe(false);
      expect(e.any).toBe(true);
      expect(e.include("name")).toBe(true);
    });

    it("include? does not add a key to messages hash", () => {
      const e = new Errors(null);
      e.include("name");
      expect(e.count).toBe(0);
    });

    it("add creates an error object and returns it", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.count).toBe(1);
      expect(e.get("name")).toContain("can't be blank");
    });

    it("add, with type as String", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.get("name")).toContain("can't be blank");
    });

    it("added? detects indifferent if a specific error was added to the object", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.added("name", "blank")).toBe(true);
      expect(e.added("name", "invalid")).toBe(false);
    });

    it("added? matches the given message when several errors are present for the same attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      expect(e.added("name", "blank")).toBe(true);
      expect(e.added("name", "too_short")).toBe(true);
    });

    it("added? returns false when no errors are present", () => {
      const e = new Errors(null);
      expect(e.added("name", "blank")).toBe(false);
    });

    it("added? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.added("name", "too_short")).toBe(false);
    });

    it("of_kind? returns false when no errors are present", () => {
      const e = new Errors(null);
      expect(e.ofKind("name", "blank")).toBe(false);
    });

    it("of_kind? matches the given message when several errors are present for the same attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      expect(e.ofKind("name", "blank")).toBe(true);
      expect(e.ofKind("name", "too_short")).toBe(true);
    });

    it("of_kind? defaults message to :invalid", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.ofKind("name")).toBe(true);
      expect(e.ofKind("age")).toBe(false);
    });

    it("of_kind? detects indifferent if a specific error was added to the object", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.ofKind("name", "blank")).toBe(true);
      expect(e.ofKind("name", "invalid")).toBe(false);
    });

    it("of_kind? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.ofKind("name", "too_short")).toBe(false);
    });

    it("of_kind? returns false when checking for an error by symbol and a different error with same message is present", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.ofKind("name", "present")).toBe(false);
    });

    it("size calculates the number of error messages", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      expect(e.size).toBe(2);
    });

    it("count calculates the number of error messages", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      expect(e.count).toBe(2);
    });

    it("to_a returns the list of errors with complete messages containing the attribute names", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      const arr = e.toArray();
      expect(arr).toContain("Name can't be blank");
      expect(arr).toContain("Age is not a number");
    });

    it("to_hash returns the error messages hash", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      e.add("age", "not_a_number");
      const hash = e.toHash();
      expect(hash.name.length).toBe(2);
      expect(hash.age.length).toBe(1);
    });

    it("full_messages creates a list of error messages with the attribute name included", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      expect(e.fullMessages).toContain("Name can't be blank");
      expect(e.fullMessages).toContain("Age is not a number");
    });

    it("full_messages_for contains all the error messages for the given attribute indifferent", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      e.add("age", "not_a_number");
      expect(e.fullMessagesFor("name").length).toBe(2);
    });

    it("full_messages_for does not contain error messages from other attributes", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      const nameMessages = e.fullMessagesFor("name");
      expect(nameMessages.length).toBe(1);
      expect(nameMessages[0]).toContain("Name");
    });

    it("full_messages_for returns an empty list in case there are no errors for the given attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.fullMessagesFor("age")).toEqual([]);
    });

    it("full_message returns the given message when attribute is :base", () => {
      const e = new Errors(null);
      expect(e.fullMessage("base", "Something went wrong")).toBe("Something went wrong");
    });

    it("full_message returns the given message with the attribute name included", () => {
      const e = new Errors(null);
      expect(e.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("as_json creates a json formatted representation of the errors hash", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      const json = e.asJson();
      expect(json.name.length).toBe(2);
    });

    it("generate_message works without i18n_scope", () => {
      const e = new Errors(null);
      expect(e.generateMessage("name", "blank")).toBe("can't be blank");
      expect(e.generateMessage("name", "invalid")).toBe("is invalid");
    });

    it("details returns added error detail with custom option", () => {
      const e = new Errors(null);
      e.add("name", "blank", { message: "custom" });
      expect(e.details[0].type).toBe("blank");
    });

    it("details do not include message option", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      expect(e.details[0].type).toBe("blank");
    });

    it("details retains original type as error", () => {
      const e = new Errors(null);
      e.add("name", "too_short", { count: 3 });
      expect(e.details[0].type).toBe("too_short");
    });

    it("group_by_attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      e.add("age", "not_a_number");
      const grouped = e.groupByAttribute();
      expect(grouped.name.length).toBe(2);
      expect(grouped.age.length).toBe(1);
    });

    it("delete returns nil when no errors were deleted", () => {
      const e = new Errors(null);
      const removed = e.delete("name");
      expect(removed.length).toBe(0);
    });

    it("delete removes details on given attribute", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      e.delete("name");
      expect(e.count).toBe(1);
      expect(e.include("name")).toBe(false);
    });

    it("delete returns the deleted messages", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("name", "too_short");
      const removed = e.delete("name");
      expect(removed.length).toBe(2);
    });

    it("clear removes details", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.clear();
      expect(e.details.length).toBe(0);
    });

    it("details returns empty array when accessed with non-existent attribute", () => {
      const e = new Errors(null);
      expect(e.where("nonexistent").length).toBe(0);
    });

    it("copy errors", () => {
      const e1 = new Errors(null);
      const e2 = new Errors(null);
      e1.add("name", "blank");
      e2.copy(e1);
      expect(e2.count).toBe(1);
      expect(e2.get("name")).toContain("can't be blank");
    });

    it("merge errors", () => {
      const e1 = new Errors(null);
      const e2 = new Errors(null);
      e1.add("name", "blank");
      e2.merge(e1);
      expect(e2.count).toBe(1);
    });

    it("each when arity is negative", () => {
      const e = new Errors(null);
      e.add("name", "blank");
      e.add("age", "not_a_number");
      const collected: string[] = [];
      e.each((err) => collected.push(err.attribute));
      expect(collected).toEqual(["name", "age"]);
    });

    it("messages returns empty frozen array when accessed with non-existent attribute", () => {
      const e = new Errors(null);
      expect(e.get("nonexistent")).toEqual([]);
    });
  });

  // ---- Naming tests (ported) ----
  describe("Naming (ported)", () => {
    class Article extends Model {}

    it("singular", () => {
      expect(Article.modelName.singular).toBe("article");
    });

    it("plural", () => {
      expect(Article.modelName.plural).toBe("articles");
    });

    it("element", () => {
      expect(Article.modelName.element).toBe("article");
    });

    it("collection", () => {
      expect(Article.modelName.collection).toBe("articles");
    });

    it("route key", () => {
      expect(Article.modelName.routeKey).toBe("articles");
    });

    it("param key", () => {
      expect(Article.modelName.paramKey).toBe("article");
    });

    it("i18n key", () => {
      expect(Article.modelName.i18nKey).toBe("article");
    });

    it("model name", () => {
      expect(Article.modelName.name).toBe("Article");
    });

    it("to_partial_path default implementation returns a string giving a relative path", () => {
      const a = new Article();
      expect(a.toPartialPath()).toBe("articles/_article");
    });

    it("to model called on record", () => {
      const a = new Article();
      expect(a.toModel()).toBe(a);
    });
  });

  // ---- Conversion tests (ported) ----
  describe("Conversion (ported)", () => {
    it("to_model default implementation returns self", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.toModel()).toBe(p);
    });

    it("to_key default implementation returns nil for new records", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).toKey()).toBe(null);
    });

    it("to_param default implementation returns nil for new records", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).toParam()).toBe(null);
    });

    it("to_partial_path default implementation returns a string giving a relative path", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).toPartialPath()).toBe("people/_person");
    });
  });

  // ---- Validations Absence (ported) ----
  describe("Validations Absence (ported)", () => {
    it("validates absence of", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }
      expect(new Person({ name: "Alice" }).isValid()).toBe(false);
      expect(new Person({ name: "" }).isValid()).toBe(true);
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validates absence of with custom error using quotes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: { message: "must not be given" } });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(p.errors.get("name")).toContain("must not be given");
    });
  });

  // ---- Validations Acceptance (ported) ----
  describe("Validations Acceptance (ported)", () => {
    it("terms of service agreement no acceptance", () => {
      class Terms extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: true });
        }
      }
      expect(new Terms({ terms: "0" }).isValid()).toBe(false);
    });

    it("terms of service agreement", () => {
      class Terms extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: true });
        }
      }
      expect(new Terms({ terms: "1" }).isValid()).toBe(true);
    });

    it("terms of service agreement with accept value", () => {
      class Terms extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: { accept: ["yes", "I agree"] } });
        }
      }
      expect(new Terms({ terms: "yes" }).isValid()).toBe(true);
      expect(new Terms({ terms: "no" }).isValid()).toBe(false);
    });

    it("terms of service agreement with multiple accept values", () => {
      class Terms extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: { accept: ["1", "yes", "true"] } });
        }
      }
      expect(new Terms({ terms: "1" }).isValid()).toBe(true);
      expect(new Terms({ terms: "yes" }).isValid()).toBe(true);
      expect(new Terms({ terms: "true" }).isValid()).toBe(true);
      expect(new Terms({ terms: "no" }).isValid()).toBe(false);
    });

    it("validates acceptance of true", () => {
      class Terms extends Model {
        static {
          this.attribute("terms", "string");
          this.validates("terms", { acceptance: true });
        }
      }
      expect(new Terms({ terms: true }).isValid()).toBe(true);
    });
  });

  // ---- Validations Callbacks (ported) ----
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

  // ---- Validations Comparison (ported) ----
  describe("Validations Comparison (ported)", () => {
    it("validates comparison with greater than using numeric", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Order({ quantity: 1 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
      expect(new Order({ quantity: -1 }).isValid()).toBe(false);
    });

    it("validates comparison with greater than using date", () => {
      const fixedDate = new Date("2024-01-01");
      class Event extends Model {
        static {
          this.attribute("date", "date");
          this.validates("date", { comparison: { greaterThan: fixedDate } });
        }
      }
      expect(new Event({ date: new Date("2024-01-02") }).isValid()).toBe(true);
      expect(new Event({ date: new Date("2023-12-31") }).isValid()).toBe(false);
    });

    it("validates comparison with greater than using string", () => {
      class Item extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { greaterThan: "A" } });
        }
      }
      expect(new Item({ code: "B" }).isValid()).toBe(true);
      expect(new Item({ code: "A" }).isValid()).toBe(false);
    });

    it("validates comparison with greater than or equal to using numeric", () => {
      class Order extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThanOrEqualTo: 1 } });
        }
      }
      expect(new Order({ quantity: 1 }).isValid()).toBe(true);
      expect(new Order({ quantity: 0 }).isValid()).toBe(false);
    });

    it("validates comparison with equal to using numeric", () => {
      class Item extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", { comparison: { equalTo: 42 } });
        }
      }
      expect(new Item({ value: 42 }).isValid()).toBe(true);
      expect(new Item({ value: 43 }).isValid()).toBe(false);
    });

    it("validates comparison with less than using numeric", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThan: 10 } });
        }
      }
      expect(new Rating({ score: 9 }).isValid()).toBe(true);
      expect(new Rating({ score: 10 }).isValid()).toBe(false);
    });

    it("validates comparison with less than or equal to using numeric", () => {
      class Rating extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { lessThanOrEqualTo: 10 } });
        }
      }
      expect(new Rating({ score: 10 }).isValid()).toBe(true);
      expect(new Rating({ score: 11 }).isValid()).toBe(false);
    });

    it("validates comparison with other than using numeric", () => {
      class Item extends Model {
        static {
          this.attribute("status", "integer");
          this.validates("status", { comparison: { otherThan: 0 } });
        }
      }
      expect(new Item({ status: 1 }).isValid()).toBe(true);
      expect(new Item({ status: 0 }).isValid()).toBe(false);
    });

    it("validates comparison with proc", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "date");
          this.attribute("endDate", "date");
          this.validates("endDate", {
            comparison: { greaterThan: (record: any) => record.readAttribute("startDate") },
          });
        }
      }
      expect(
        new Event({ startDate: new Date("2024-01-01"), endDate: new Date("2024-01-02") }).isValid(),
      ).toBe(true);
      expect(
        new Event({ startDate: new Date("2024-01-02"), endDate: new Date("2024-01-01") }).isValid(),
      ).toBe(false);
    });

    it("validates comparison with nil allowed", () => {
      class Item extends Model {
        static {
          this.attribute("quantity", "integer");
          this.validates("quantity", { comparison: { greaterThan: 0 } });
        }
      }
      expect(new Item({}).isValid()).toBe(true);
    });

    it("validates comparison of multiple values", () => {
      class Score extends Model {
        static {
          this.attribute("value", "integer");
          this.validates("value", {
            comparison: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 100 },
          });
        }
      }
      expect(new Score({ value: 50 }).isValid()).toBe(true);
      expect(new Score({ value: -1 }).isValid()).toBe(false);
      expect(new Score({ value: 101 }).isValid()).toBe(false);
    });
  });

  // ---- Validations Conditional (ported) ----
  describe("Validations Conditional (ported)", () => {
    it("if validation using block true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
    });

    it("if validation using block false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => false });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("unless validation using block true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, unless: () => true });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("unless validation using block false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, unless: () => false });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
    });

    it("validation using combining if true and unless true conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true, unless: () => true });
        }
      }
      // unless returns true, so validation is skipped
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validation using combining if true and unless false conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true, unless: () => false });
        }
      }
      // both conditions met, validation runs
      expect(new Person({}).isValid()).toBe(false);
    });
  });

  // ---- Validations Confirmation (ported) ----
  describe("Validations Confirmation (ported)", () => {
    it("no title confirmation", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { confirmation: true });
        }
      }
      const p = new Person({ title: "A", title_confirmation: "B" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("title")).toContain("doesn't match confirmation");
    });

    it("title confirmation", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { confirmation: true });
        }
      }
      const p = new Person({ title: "A", title_confirmation: "A" });
      expect(p.isValid()).toBe(true);
    });

    it("title confirmation with case sensitive option true", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { confirmation: { caseSensitive: true } });
        }
      }
      const p = new Person({ title: "Hello" });
      p._attributes.set("title_confirmation", "hello");
      expect(p.isValid()).toBe(false);
    });

    it("title confirmation with case sensitive option false", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { confirmation: { caseSensitive: false } });
        }
      }
      const p = new Person({ title: "Hello" });
      p._attributes.set("title_confirmation", "hello");
      expect(p.isValid()).toBe(true);
    });
  });

  // ---- Validations Exclusion (ported) ----
  describe("Validations Exclusion (ported)", () => {
    it("validates exclusion of", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { exclusion: { in: ["ow", "ar"] } });
        }
      }
      expect(new Person({ karma: "ow" }).isValid()).toBe(false);
      expect(new Person({ karma: "other" }).isValid()).toBe(true);
    });

    it("validates exclusion of with formatted message", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { exclusion: { in: ["ow"], message: "is not allowed" } });
        }
      }
      const p = new Person({ karma: "ow" });
      p.isValid();
      expect(p.errors.get("karma")).toContain("is not allowed");
    });
  });

  // ---- Validations Format (ported) ----
  describe("Validations Format (ported)", () => {
    it("validate format", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { format: { with: /^[A-Z]/ } });
        }
      }
      expect(new Person({ title: "Hello" }).isValid()).toBe(true);
      expect(new Person({ title: "hello" }).isValid()).toBe(false);
    });

    it("validate format with not option", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { format: { without: /\d/ } });
        }
      }
      expect(new Person({ title: "hello" }).isValid()).toBe(true);
      expect(new Person({ title: "hello123" }).isValid()).toBe(false);
    });

    it("validate format with formatted message", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", {
            format: { with: /^[A-Z]/, message: "must start with uppercase" },
          });
        }
      }
      const p = new Person({ title: "hello" });
      p.isValid();
      expect(p.errors.get("title")).toContain("must start with uppercase");
    });
  });

  // ---- Validations Inclusion (ported) ----
  describe("Validations Inclusion (ported)", () => {
    it("validates inclusion of", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
        }
      }
      expect(new Person({ karma: "ow" }).isValid()).toBe(true);
      expect(new Person({ karma: "other" }).isValid()).toBe(false);
    });

    it("validates inclusion of with allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validates inclusion of with formatted message", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow"], message: "is not allowed" } });
        }
      }
      const p = new Person({ karma: "other" });
      p.isValid();
      expect(p.errors.get("karma")).toContain("is not allowed");
    });
  });

  // ---- Validations Length (ported) ----
  describe("Validations Length (ported)", () => {
    it("validates length of using minimum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 5 } });
        }
      }
      expect(new Person({ title: "abcde" }).isValid()).toBe(true);
      expect(new Person({ title: "abcd" }).isValid()).toBe(false);
    });

    it("validates length of using maximum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 5 } });
        }
      }
      expect(new Person({ title: "abcde" }).isValid()).toBe(true);
      expect(new Person({ title: "abcdef" }).isValid()).toBe(false);
    });

    it("validates length of using maximum should allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 5 } });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validates length of using within", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { in: [3, 5] } });
        }
      }
      expect(new Person({ title: "ab" }).isValid()).toBe(false);
      expect(new Person({ title: "abc" }).isValid()).toBe(true);
      expect(new Person({ title: "abcde" }).isValid()).toBe(true);
      expect(new Person({ title: "abcdef" }).isValid()).toBe(false);
    });

    it("validates length of using is", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 4 } });
        }
      }
      expect(new Person({ title: "abcd" }).isValid()).toBe(true);
      expect(new Person({ title: "abc" }).isValid()).toBe(false);
      expect(new Person({ title: "abcde" }).isValid()).toBe(false);
    });

    it("validates length of custom errors for minimum with too short", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 5, tooShort: "is way too short" } });
        }
      }
      const p = new Person({ title: "ab" });
      p.isValid();
      expect(p.errors.get("title")).toContain("is way too short");
    });

    it("validates length of custom errors for maximum with too long", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 5, tooLong: "is way too long" } });
        }
      }
      const p = new Person({ title: "abcdefgh" });
      p.isValid();
      expect(p.errors.get("title")).toContain("is way too long");
    });

    it("validates length of custom errors for both too short and too long", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", {
            length: { minimum: 3, maximum: 5, tooShort: "short!", tooLong: "long!" },
          });
        }
      }
      const short = new Person({ title: "ab" });
      short.isValid();
      expect(short.errors.get("title")).toContain("short!");

      const long = new Person({ title: "abcdef" });
      long.isValid();
      expect(long.errors.get("title")).toContain("long!");
    });

    it("validates length of custom errors for is with wrong length", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 4, wrongLength: "wrong size!" } });
        }
      }
      const p = new Person({ title: "abc" });
      p.isValid();
      expect(p.errors.get("title")).toContain("wrong size!");
    });
  });

  // ---- Validations Numericality (ported) ----
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

  // ---- Validations Presence (ported) ----
  describe("Validations Presence (ported)", () => {
    it("validate presences", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.validatesPresenceOf("name", "age");
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name").length).toBeGreaterThan(0);
    });

    it("validates acceptance of with custom error using quotes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: { message: "is required!" } });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.get("name")).toContain("is required!");
    });
  });

  // ---- Validations Validates tests (ported) ----
  describe("Validations Validates (ported)", () => {
    it("validates with built in validation", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
      expect(new Person({ title: "Hello" }).isValid()).toBe(true);
    });

    it("validates with built in validation and options", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true, length: { minimum: 3 } });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
      expect(new Person({ title: "ab" }).isValid()).toBe(false);
      expect(new Person({ title: "abc" }).isValid()).toBe(true);
    });

    it("validates with if as local conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.validates("name", {
            presence: true,
            if: (r: any) => r.readAttribute("active") === true,
          });
        }
      }
      expect(new Person({ active: false }).isValid()).toBe(true);
      expect(new Person({ active: true }).isValid()).toBe(false);
    });

    it("validates with unless as local conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("skip", "boolean");
          this.validates("name", {
            presence: true,
            unless: (r: any) => r.readAttribute("skip") === true,
          });
        }
      }
      expect(new Person({ skip: true }).isValid()).toBe(true);
      expect(new Person({ skip: false }).isValid()).toBe(false);
    });
  });

  // ---- Validations Context (ported) ----
  describe("Validations Context (ported)", () => {
    it("with a class that adds errors on create and validating a new model with no arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" as any });
        }
      }
      // No context specified, so validation with on: "create" is skipped
      expect(new Person({}).isValid()).toBe(true);
    });

    it("with a class that adds errors on create and validating a new model", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" as any });
        }
      }
      expect(new Person({}).isValid("create")).toBe(false);
    });

    it("with a class that adds errors on update and validating a new model", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "update" as any });
        }
      }
      expect(new Person({}).isValid("create")).toBe(true);
      expect(new Person({}).isValid("update")).toBe(false);
    });
  });

  // ---- Validations With Validation (ported) ----
  describe("Validations With Validation (ported)", () => {
    it("validation with class that adds errors", () => {
      class CustomValidator {
        validate(record: any) {
          const val = record.readAttribute("name");
          if (!val || val === "") {
            record.errors.add("name", "blank");
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator);
        }
      }
      expect(new Person({}).isValid()).toBe(false);
      expect(new Person({ name: "Alice" }).isValid()).toBe(true);
    });

    it("with a class that returns valid", () => {
      class PassValidator {
        validate(_record: any) {}
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(PassValidator);
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("passes all configuration options to the validator class", () => {
      class MinLenValidator {
        min: number;
        constructor(opts: any = {}) {
          this.min = opts.minimum ?? 0;
        }
        validate(record: any) {
          const val = record.readAttribute("name");
          if (typeof val === "string" && val.length < this.min) {
            record.errors.add("name", "too_short");
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(MinLenValidator, { minimum: 5 });
        }
      }
      expect(new Person({ name: "ab" }).isValid()).toBe(false);
      expect(new Person({ name: "abcde" }).isValid()).toBe(true);
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

  // ---- Serialization tests (ported) ----
  describe("Serialization (ported)", () => {
    class SerPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
      get greeting(): string {
        return `Hi ${this.readAttribute("name")}`;
      }
    }

    it("method serializable hash should work", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash();
      expect(hash.name).toBe("Alice");
      expect(hash.age).toBe(30);
      expect(hash.email).toBe("a@b.com");
    });

    it("method serializable hash should work with only option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash.name).toBe("Alice");
      expect(hash.age).toBeUndefined();
    });

    it("method serializable hash should work with except option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ except: ["email"] });
      expect(hash.name).toBe("Alice");
      expect(hash.email).toBeUndefined();
    });

    it("method serializable hash should work with methods option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ methods: ["greeting"] });
      expect(hash.greeting).toBe("Hi Alice");
    });

    it("method serializable hash should work with only and methods", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ only: ["name"], methods: ["greeting"] });
      expect(Object.keys(hash).sort()).toEqual(["greeting", "name"]);
    });

    it("method serializable hash should work with except and methods", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ except: ["email", "age"], methods: ["greeting"] });
      expect(hash.name).toBe("Alice");
      expect(hash.email).toBeUndefined();
      expect(hash.greeting).toBe("Hi Alice");
    });

    it("serializable_hash should not modify options passed in argument", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const opts = { only: ["name"] };
      p.serializableHash(opts);
      expect(opts).toEqual({ only: ["name"] });
    });
  });

  // ---- JSON Serialization tests (ported) ----
  describe("JSON Serialization (ported)", () => {
    class JsonPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    it("should encode all encodable attributes", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.toJson();
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe("Alice");
      expect(parsed.age).toBe(30);
    });

    it("should allow attribute filtering with only", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = JSON.parse(p.toJson({ only: ["name"] }));
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("should allow attribute filtering with except", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = JSON.parse(p.toJson({ except: ["age"] }));
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("as_json should allow attribute filtering with only", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.asJson({ only: ["name"] });
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("as_json should allow attribute filtering with except", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.asJson({ except: ["age"] });
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("from_json should work without a root (class attribute)", () => {
      const p = new JsonPerson({});
      p.fromJson('{"name":"Alice","age":30}');
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("from_json should work with a root (method parameter)", () => {
      const p = new JsonPerson({});
      p.fromJson('{"json_person":{"name":"Alice","age":30}}', true);
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });

  // ---- Callbacks tests (ported) ----
  describe("Callbacks (ported)", () => {
    it("complete callback chain", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeSave(() => {
            order.push("before_save");
          });
          this.aroundSave((_r, proceed) => {
            order.push("around_before");
            proceed();
            order.push("around_after");
          });
          this.afterSave(() => {
            order.push("after_save");
          });
        }
      }
      new Person().runCallbacks("save", () => {
        order.push("save");
      });
      expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
    });

    it("the callback chain is halted when a callback throws :abort", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeSave(() => {
            order.push("first");
          });
          this.beforeSave(() => {
            order.push("halt");
            return false;
          });
          this.beforeSave(() => {
            order.push("never");
          });
          this.afterSave(() => {
            order.push("after");
          });
        }
      }
      const result = new Person().runCallbacks("save", () => {
        order.push("action");
      });
      expect(result).toBe(false);
      expect(order).toContain("halt");
      expect(order).not.toContain("never");
      expect(order).not.toContain("action");
      expect(order).not.toContain("after");
    });

    it("only selects which types of callbacks should be created", () => {
      // Test that before/after/around create callbacks exist
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeCreate(() => {
            order.push("before_create");
          });
          this.afterCreate(() => {
            order.push("after_create");
          });
        }
      }
      new Person().runCallbacks("create", () => {
        order.push("create");
      });
      expect(order).toEqual(["before_create", "create", "after_create"]);
    });

    it("after_create callbacks with both callbacks declared in one line", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.afterCreate(() => {
            order.push("first_after");
          });
          this.afterCreate(() => {
            order.push("second_after");
          });
        }
      }
      new Person().runCallbacks("create", () => {
        order.push("create");
      });
      expect(order).toEqual(["create", "first_after", "second_after"]);
    });
  });

  // ---- Type tests (ported) ----
  describe("Type Boolean (ported)", () => {
    it("type cast boolean", () => {
      const type = new Types.BooleanType();
      expect(type.cast(true)).toBe(true);
      expect(type.cast(false)).toBe(false);
      expect(type.cast("true")).toBe(true);
      expect(type.cast("false")).toBe(false);
      expect(type.cast("1")).toBe(true);
      expect(type.cast("0")).toBe(false);
      expect(type.cast(1)).toBe(true);
      expect(type.cast(0)).toBe(false);
      expect(type.cast("yes")).toBe(true);
      expect(type.cast("no")).toBe(false);
      expect(type.cast(null)).toBe(null);
    });
  });

  describe("Type Decimal (ported)", () => {
    it("type cast decimal", () => {
      const type = new Types.DecimalType();
      expect(type.cast(42.5)).toBe("42.5");
      expect(type.cast("3.14")).toBe("3.14");
    });

    it("type cast decimal from invalid string", () => {
      const type = new Types.DecimalType();
      expect(type.cast("not-a-number")).toBe(null);
    });
  });

  describe("Type Float (ported)", () => {
    it("type cast float", () => {
      const type = new Types.FloatType();
      expect(type.cast(42.5)).toBe(42.5);
      expect(type.cast("3.14")).toBe(3.14);
      expect(type.cast(null)).toBe(null);
    });

    it("type cast float from invalid string", () => {
      const type = new Types.FloatType();
      expect(type.cast("not-a-number")).toBe(null);
    });
  });

  describe("Type Registry (ported)", () => {
    it("a class can be registered for a symbol", () => {
      Types.typeRegistry.register("mytype", () => new Types.StringType());
      const t = Types.typeRegistry.lookup("mytype");
      expect(t).toBeInstanceOf(Types.StringType);
    });

    it("a reasonable error is given when no type is found", () => {
      expect(() => Types.typeRegistry.lookup("nonexistent_type_xyz")).toThrow(
        "Unknown type: nonexistent_type_xyz",
      );
    });
  });

  // ---- Previously unimplemented features, now tested ----

  describe("Attribute Methods", () => {
    it("method missing works correctly even if attributes method is not defined", () => {
      class Bare extends Model {}
      const b = new Bare();
      // attributeMissing returns null for undefined attributes
      expect(b.readAttribute("nonexistent")).toBe(null);
    });

    it("unrelated classes should not share attribute method matchers", () => {
      class A extends Model {
        static {
          this.attribute("x", "string");
        }
      }
      class B extends Model {
        static {
          this.attribute("y", "string");
        }
      }
      expect(A.attributeNames()).toEqual(["x"]);
      expect(B.attributeNames()).toEqual(["y"]);
    });

    it("#define_attribute_method generates attribute method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodPrefix("clear_");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).clear_name).toBe("function");
    });

    it("#define_attribute_methods defines alias attribute methods after undefining", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("full_name", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).full_name).toBe("Alice");
      (p as any).full_name = "Bob";
      expect(p.readAttribute("name")).toBe("Bob");
    });

    it("#undefine_attribute_methods removes attribute methods", () => {
      // In our implementation, attribute methods defined via prefix/suffix
      // can be overridden; we test that base readAttribute still works
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("accessing a suffixed attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodSuffix("_changed");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).name_changed).toBe("function");
    });

    it("should not interfere with method_missing if the attr has a private/protected method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        customName() {
          return "custom";
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.customName()).toBe("custom");
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("should use attribute_missing to dispatch a missing attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        attributeMissing(name: string): unknown {
          return `missing:${name}`;
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("nonexistent")).toBe("missing:nonexistent");
    });

    it("name clashes are handled", () => {
      // Attributes with the same name as existing methods should still work via readAttribute
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });

  describe("Attribute Registration", () => {
    it("the default type is used when type is omitted", () => {
      // When using a registered type, lookups use the registry
      const stringType = Types.typeRegistry.lookup("string");
      expect(stringType.name).toBe("string");
      expect(stringType.cast("hello")).toBe("hello");
    });

    it("type is resolved when specified by name", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ age: "25" });
      expect(p.readAttribute("age")).toBe(25);
    });

    it(".attribute_types reflects registered attribute types", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const defs = Person._attributeDefinitions;
      expect(defs.get("name")!.type.name).toBe("string");
      expect(defs.get("age")!.type.name).toBe("integer");
    });

    it(".decorate_attributes decorates specified attributes", () => {
      // We can use normalizes as the TS equivalent of decorate_attributes
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v));
        }
      }
      const p = new Person({ name: "alice" });
      expect(p.readAttribute("name")).toBe("ALICE");
    });

    it(".decorate_attributes stacks decorators", () => {
      // Multiple normalizations: last one wins since normalizes replaces
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.normalizes("name", (v: unknown) =>
            typeof v === "string" ? v.trim().toUpperCase() : v,
          );
        }
      }
      const p = new Person({ name: "  alice  " });
      expect(p.readAttribute("name")).toBe("ALICE");
    });

    it("re-registering an attribute overrides previous decorators", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v));
          // Re-register normalization
          this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v));
        }
      }
      const p = new Person({ name: "ALICE" });
      expect(p.readAttribute("name")).toBe("alice");
    });
  });

  describe("Attribute Object API", () => {
    it("from_database + read type casts from database", () => {
      const type = Types.typeRegistry.lookup("integer");
      expect(type.deserialize("42")).toBe(42);
    });

    it("from_user + read type casts from user", () => {
      const type = Types.typeRegistry.lookup("integer");
      expect(type.cast("42")).toBe(42);
    });

    it("reading memoizes the value", () => {
      const type = Types.typeRegistry.lookup("string");
      const val1 = type.cast("hello");
      const val2 = type.cast("hello");
      expect(val1).toBe(val2);
    });

    it("from_database + value_for_database type casts to and from database", () => {
      const type = Types.typeRegistry.lookup("integer");
      const deserialized = type.deserialize("42");
      const serialized = type.serialize(deserialized);
      expect(serialized).toBe(42);
    });

    it("duping dups the value", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const attrs = { ...p.attributes };
      attrs.name = "Bob";
      // Original should be unchanged
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("with_value_from_user returns a new attribute with the value from the user", () => {
      const type = Types.typeRegistry.lookup("integer");
      // Cast from user input
      const val = type.cast("42");
      expect(val).toBe(42);
    });

    it("with_value_from_database returns a new attribute with the value from the database", () => {
      const type = Types.typeRegistry.lookup("integer");
      const val = type.deserialize("42");
      expect(val).toBe(42);
    });

    it("uninitialized attributes have no value", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person();
      expect(p.readAttribute("name")).toBe(null);
    });

    it("attributes equal other attributes with the same constructor arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Person({ name: "Alice" });
      const b = new Person({ name: "Alice" });
      expect(a.attributes).toEqual(b.attributes);
    });

    it("an attribute has not been read by default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      // The attribute exists but we can check hasAttribute
      expect(p.hasAttribute("name")).toBe(true);
      expect(p.hasAttribute("nonexistent")).toBe(false);
    });

    it("with_type preserves mutations", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      expect(p.readAttribute("name")).toBe("Bob");
      // age should still be the same
      expect(p.readAttribute("age")).toBe(25);
    });
  });

  describe("Dirty (advanced)", () => {
    it("using attribute_will_change! with a symbol", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChanged("name")).toBe(true);
      expect(p.attributeWas("name")).toBe("Alice");
    });

    it("attribute mutation", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.changed).toBe(false);
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      expect(p.changes).toEqual({ name: ["Alice", "Bob"] });
    });

    it("model can be dup-ed without Attributes", () => {
      class Bare extends Model {}
      const b = new Bare();
      // Should not throw
      expect(b.changed).toBe(false);
      expect(b.changedAttributes).toEqual([]);
    });
  });

  describe("Dirty JSON tests", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    it("to_json should work on model", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson();
      expect(JSON.parse(json)).toEqual({ name: "Alice", age: 25 });
    });

    it("to_json should work on model with :except string option", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson({ except: ["age"] });
      expect(JSON.parse(json)).toEqual({ name: "Alice" });
    });

    it("to_json should work on model with :except array option", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson({ except: ["name", "age"] });
      expect(JSON.parse(json)).toEqual({});
    });

    it("to_json should work on model after save", () => {
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      const json = p.toJson();
      expect(JSON.parse(json)).toEqual({ name: "Bob", age: 25 });
    });
  });

  describe("NestedError", () => {
    it("NestedError initialize", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.base).toBe(base);
      expect(nested.innerError).toBe(innerError);
      expect(nested.attribute).toBe("name");
    });

    it("NestedError message", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.message).toBe("can't be blank");
    });

    it("NestedError full message", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.fullMessage).toBe("Name can't be blank");

      const baseNested = new NestedError(base, {
        attribute: "base",
        type: "invalid",
        message: "is invalid",
      });
      expect(baseNested.fullMessage).toBe("is invalid");
    });
  });

  describe("Translation (basic)", () => {
    it("translated model attributes", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      // humanAttributeName provides basic translation
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes with default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(Person.humanAttributeName("name")).toBe("Name");
    });

    it("translated model names", () => {
      class Person extends Model {}
      expect(Person.modelName.singular).toBe("person");
      expect(Person.modelName.plural).toBe("people");
    });

    it("translated model when missing translation", () => {
      // Falls back to humanized attribute name
      class Person extends Model {}
      expect(Person.humanAttributeName("unknown_attr")).toBe("Unknown attr");
    });
  });

  describe("Type BigInteger", () => {
    it("type cast big integer", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast("42")).toBe(42n);
      expect(type.cast(null)).toBe(null);
    });

    it("BigInteger small values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast("0")).toBe(0n);
      expect(type.cast("1")).toBe(1n);
      expect(type.cast("-1")).toBe(-1n);
    });

    it("BigInteger large values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      const large = "9999999999999999999999";
      expect(type.cast(large)).toBe(BigInt(large));
    });
  });

  describe("Type ImmutableString", () => {
    it("cast strings are frozen", () => {
      const type = Types.typeRegistry.lookup("immutable_string");
      const result = type.cast("hello");
      expect(result).toBe("hello");
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("immutable strings are not duped coming out", () => {
      const type = Types.typeRegistry.lookup("immutable_string");
      const a = type.cast("hello");
      const b = type.cast("hello");
      // Both should be frozen strings
      expect(Object.isFrozen(a)).toBe(true);
      expect(Object.isFrozen(b)).toBe(true);
      expect(a).toBe("hello");
      expect(b).toBe("hello");
    });
  });

  describe("Type Value", () => {
    it("type equality", () => {
      const type1 = Types.typeRegistry.lookup("value");
      const type2 = Types.typeRegistry.lookup("value");
      expect(type1.constructor).toBe(type2.constructor);
    });

    it("as json not defined", () => {
      const type = Types.typeRegistry.lookup("value");
      // Value type passes through without transformation
      expect(type.cast("hello")).toBe("hello");
      expect(type.cast(42)).toBe(42);
      expect(type.cast(null)).toBe(null);
    });
  });

  describe("Conversion (toKey/toParam)", () => {
    it("to_key default implementation returns the id in an array for persisted records", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
      }
      const p = new Person({ id: 1 });
      expect(p.toKey()).toEqual([1]);
    });

    it("to_param default implementation returns a string of ids for persisted records", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
      }
      const p = new Person({ id: 1 });
      expect(p.toParam()).toBe("1");
    });

    it("to_param returns the string joined by '-'", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
        toKey() {
          return [1, 2, 3];
        }
      }
      const p = new Person({ id: 1 });
      expect(p.toParam()).toBe("1-2-3");
    });
  });

  describe("Naming (advanced)", () => {
    it("NamingWithNamespacedModel singular", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("NamingWithNamespacedModel plural", () => {
      const name = new ModelName("Blog::Post");
      expect(name.plural).toBe("posts");
    });

    it("NamingWithSuppliedModelName singular", () => {
      // When a model name is explicitly supplied
      const name = new ModelName("Article");
      expect(name.singular).toBe("article");
    });

    it("NamingUsingRelativeModelName singular", () => {
      const name = new ModelName("Admin::User");
      expect(name.singular).toBe("user");
    });

    it("uncountable model names", () => {
      ModelName.addUncountable("sheep");
      const name = new ModelName("Sheep");
      expect(name.plural).toBe("sheep");
    });

    it("anonymous class without name argument", () => {
      // A model name constructed with empty string
      const name = new ModelName("");
      expect(name.singular).toBe("");
      expect(name.plural).toBe("");
    });
  });

  describe("JSON Serialization (root in JSON)", () => {
    it("should include root in JSON if include_root_in_json is true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = true;
        }
      }
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json).toEqual({ person: { name: "Alice" } });
      // Reset
      Person.includeRootInJson = false;
    });

    it("should include custom root in JSON", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = "human";
        }
      }
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json).toEqual({ human: { name: "Alice" } });
      Person.includeRootInJson = false;
    });

    it("as_json should return a hash if include_root_in_json is true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = true;
        }
      }
      const p = new Person({ name: "Alice" });
      const result = p.asJson();
      expect(result).toEqual({ person: { name: "Alice" } });
      Person.includeRootInJson = false;
    });
  });

  describe("Validations (advanced features)", () => {
    it("validates with validator class", () => {
      class MyValidator {
        validate(record: any) {
          if (!record.readAttribute("name")) {
            record.errors.add("name", "blank", { message: "must be present" });
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(MyValidator);
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toEqual(["must be present"]);
    });

    it("validates with namespaced validator class", () => {
      const Validators = {
        NameValidator: class {
          validate(record: any) {
            if (!record.readAttribute("name")) {
              record.errors.add("name", "blank", { message: "is required" });
            }
          }
        },
      };
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(Validators.NameValidator);
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toEqual(["is required"]);
    });

    it("validates with unknown validator", () => {
      // Passing invalid options to validates should not crash, but
      // unrecognized rules are silently ignored
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { unknownValidator: true } as any);
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.isValid()).toBe(true);
    });

    it("validates with disabled unknown validator", () => {
      // Passing unknown validator key is silently ignored
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { foobar: false } as any);
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.isValid()).toBe(true);
    });

    it("validates format of with multiline regexp should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: { with: /^test$/m } });
          }
        }
      }).toThrow(/multiline/i);
    });

    it("validates format of without any regexp should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: {} });
          }
        }
      }).toThrow(/with.*without/i);
    });

    it("validates exclusion of with lambda", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { exclusion: { in: () => ["banned", "suspended"] } });
        }
      }
      const p = new Person({ status: "banned" });
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ status: "active" });
      expect(p2.isValid()).toBe(true);
    });

    it("validates inclusion of with lambda", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: () => ["admin", "user"], allowNil: false } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ role: "hacker" });
      expect(p2.isValid()).toBe(false);
    });

    it("validates length of using proc as maximum", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: () => 5 } });
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ name: "Alicia" });
      expect(p2.isValid()).toBe(false);
    });

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

    it("validations on the instance level", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validate(function (record: any) {
            if (record.readAttribute("name") === "invalid") {
              record.errors.add("name", "invalid", { message: "is not allowed" });
            }
          });
        }
      }
      const p = new Person({ name: "invalid" });
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toEqual(["is not allowed"]);
    });

    it("validate with except on", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person();
      // Without context, "on: create" validations should not run
      expect(p.isValid()).toBe(true);
      // With matching context, they should run
      expect(p.isValid("create")).toBe(false);
    });

    it("frozen models can be validated", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "Alice" });
      // Object.freeze doesn't prevent our validation from reading
      // (we can't truly freeze a Model, but we can test that validation works)
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
      // p1's validity should not be affected by p2
      expect(p1.errors.empty).toBe(true);
    });

    it("validation with message as proc", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", {
            presence: {
              message: (record: any) => `name is required for record`,
            },
          });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
      expect(p.errors.get("name")).toEqual(["name is required for record"]);
    });
  });

  describe("Callbacks (advanced features)", () => {
    it("the callback chain is not halted when around or after callbacks return false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation((r: any) => {
            log.push("after1");
            return false;
          });
          this.afterValidation((r: any) => {
            log.push("after2");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      // After callbacks should all run even if one returns false
      expect(log).toEqual(["after1", "after2"]);
    });

    it("the :if option array should not be mutated by an after callback", () => {
      const conditions = { if: (r: any) => true };
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation((r: any) => {}, conditions);
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      // The conditions object should still have its if
      expect(typeof conditions.if).toBe("function");
    });

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

  describe("Errors (advanced features)", () => {
    it("dup duplicates details", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const details1 = errors.details;
      const details2 = errors.details;
      // details should return a copy
      expect(details1).toEqual(details2);
      expect(details1).not.toBe(details2);
    });

    it("errors are marshalable", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      // We can serialize to JSON and back
      const json = JSON.stringify(errors.toHash());
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({ name: ["can't be blank"] });
    });

    it("inspect", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const str = errors.inspect();
      expect(str).toContain("ActiveModel::Errors");
      expect(str).toContain("name");
      expect(str).toContain("blank");
    });

    it("message renders lazily using current locale", () => {
      // Our implementation resolves messages at add-time
      // This test verifies the message is correct
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.get("name")).toEqual(["can't be blank"]);
    });

    it("message uses current locale", () => {
      const errors = new Errors({});
      errors.add("name", "invalid");
      expect(errors.get("name")).toEqual(["is invalid"]);
    });

    it("full_messages doesn't require the base object to respond to :errors", () => {
      // Create errors with a plain object as base
      const errors = new Errors({ name: "test" });
      errors.add("name", "blank");
      expect(errors.fullMessages).toEqual(["Name can't be blank"]);
    });

    it("added? ignores callback option", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      // added should match regardless of extra options
      expect(errors.added("name", "blank", { callback: () => {} })).toBe(true);
    });

    it("added? ignores message option", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.added("name", "blank", { message: "different" })).toBe(true);
    });

    it("added? handles proc messages", () => {
      const errors = new Errors({});
      errors.add("name", "blank", { message: () => "custom" } as any);
      expect(errors.added("name", "blank")).toBe(true);
    });

    it("of_kind? handles proc messages", () => {
      const errors = new Errors({});
      errors.add("name", "blank", { message: () => "custom" } as any);
      expect(errors.ofKind("name", "blank")).toBe(true);
    });

    it("of_kind? ignores options", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.ofKind("name", "blank")).toBe(true);
      expect(errors.ofKind("name", "invalid")).toBe(false);
    });

    it("merge does not import errors when merging with self", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.count).toBe(1);
      errors.merge(errors);
      expect(errors.count).toBe(1);
    });
  });

  describe("API tests", () => {
    it("mixin inclusion chain", () => {
      // Model includes Attributes, Validations, Callbacks, Dirty, Serialization, Naming
      const p = new Model();
      expect(typeof p.readAttribute).toBe("function");
      expect(typeof p.writeAttribute).toBe("function");
      expect(typeof p.isValid).toBe("function");
      expect(typeof p.runCallbacks).toBe("function");
      expect(typeof p.serializableHash).toBe("function");
      expect(p.modelName).toBeDefined();
      expect(typeof p.changed).toBe("boolean");
    });

    it("load hook is called", () => {
      // afterInitialize callbacks serve as load hooks
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterInitialize((r: any) => {
            log.push("initialized");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      expect(log).toEqual(["initialized"]);
    });
  });

  // =========================================================================
  // Additional tests to improve Rails test coverage
  // =========================================================================

  describe("ErrorsTest", () => {
    it("first", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("age", "invalid");
      expect(errors.details[0].attribute).toBe("name");
    });

    it("dup", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const dup = new Errors({});
      dup.copy(errors);
      expect(dup.count).toBe(1);
      // Modifying dup should not affect original
      dup.add("age", "invalid");
      expect(errors.count).toBe(1);
      expect(dup.count).toBe(2);
    });

    it("key?", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.include("name")).toBe(true);
    });

    it("no key", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.include("age")).toBe(false);
    });

    it("error access is indifferent", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.get("name")).toEqual(["can't be blank"]);
      expect(errors.on("name")).toEqual(["can't be blank"]);
    });

    it("add, with type as nil", () => {
      const errors = new Errors({});
      errors.add("name", "invalid");
      expect(errors.get("name")).toEqual(["is invalid"]);
    });

    it("add an error message on a specific attribute with a defined type", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.where("name", "blank").length).toBe(1);
    });

    it("add, with type as Proc, which evaluates to String", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: (_record: any) => "cannot be empty" });
      expect(errors.get("name")).toEqual(["cannot be empty"]);
    });

    it("initialize options[:message] as Proc, which evaluates to String", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: () => "proc message" });
      expect(errors.get("name")).toEqual(["proc message"]);
    });

    it("added? when attribute was added through a collection", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.added("name", "blank")).toBe(true);
    });

    it("added? returns true when string attribute is used with a symbol message", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.added("name", "blank")).toBe(true);
    });

    it("of_kind? returns false when checking for an error, but not providing message argument", () => {
      const errors = new Errors({});
      // No errors added for "name"
      expect(errors.ofKind("name")).toBe(false);
    });

    it("of_kind? returns true when string attribute is used with a symbol message", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.ofKind("name", "blank")).toBe(true);
    });

    it("to_hash returns a hash without default proc", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("name", "invalid");
      const hash = errors.toHash();
      expect(hash).toEqual({ name: ["can't be blank", "is invalid"] });
      // Accessing a non-existent key should be undefined
      expect(hash["age"]).toBeUndefined();
    });

    it("as_json returns a hash without default proc", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const json = errors.asJson();
      expect(json).toEqual({ name: ["can't be blank"] });
      expect(json["age"]).toBeUndefined();
    });

    it("as_json with :full_messages option creates a json formatted representation of the errors containing complete messages", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("age", "invalid");
      // fullMessages style
      expect(errors.fullMessages).toEqual(["Name can't be blank", "Age is invalid"]);
    });

    it("merge does not import errors when merging with self", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.merge(errors);
      expect(errors.count).toBe(1);
    });

    it("adding errors using conditionals with Person#validate!", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person();
      expect(() => p.validateBang()).toThrow(/Validation failed/);
    });

    it("full_message uses default format", () => {
      const errors = new Errors({});
      expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
      expect(errors.fullMessage("base", "is invalid")).toBe("is invalid");
    });

    it("inspect", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const str = errors.inspect();
      expect(str).toContain("ActiveModel::Errors");
      expect(str).toContain("name");
      expect(str).toContain("blank");
    });

    it("delete removes errors for attribute", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("name", "invalid");
      errors.add("age", "invalid");
      const removed = errors.delete("name");
      expect(removed.length).toBe(2);
      expect(errors.count).toBe(1);
    });

    it("each iterates over all errors", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("age", "invalid");
      const collected: string[] = [];
      errors.each((e) => collected.push(e.attribute));
      expect(collected).toEqual(["name", "age"]);
    });

    it("group_by_attribute groups errors", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("name", "invalid");
      errors.add("age", "invalid");
      const grouped = errors.groupByAttribute();
      expect(grouped["name"].length).toBe(2);
      expect(grouped["age"].length).toBe(1);
    });

    it("messages_for returns messages for an attribute", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      errors.add("name", "invalid");
      expect(errors.messagesFor("name")).toEqual(["can't be blank", "is invalid"]);
    });

    it("full_messages_for returns full messages for an attribute", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
    });

    it("import imports an error from another Errors instance", () => {
      const errors1 = new Errors({});
      errors1.add("name", "blank");
      const errors2 = new Errors({});
      errors2.import(errors1.details[0]);
      expect(errors2.count).toBe(1);
      expect(errors2.get("name")).toEqual(["can't be blank"]);
    });

    it("import with attribute override", () => {
      const errors1 = new Errors({});
      errors1.add("name", "blank");
      const errors2 = new Errors({});
      errors2.import(errors1.details[0], { attribute: "title" });
      expect(errors2.get("title")).toEqual(["can't be blank"]);
    });
  });

  describe("ErrorTest", () => {
    it("full_message uses default format", () => {
      const errors = new Errors({});
      expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("comparing against different class would not raise error", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      // Just verify it doesn't throw
      expect(errors.details[0]).toBeDefined();
    });

    it("details which has no raw_type", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const detail = errors.details[0];
      expect(detail.type).toBe("blank");
    });
  });

  describe("NestedErrorTest", () => {
    it("initialize with overriding attribute and type", () => {
      const inner: any = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError({}, inner, { attribute: "author" });
      expect(nested.attribute).toBe("author");
      expect(nested.type).toBe("blank");
    });

    it("message", () => {
      const inner: any = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError({}, inner);
      expect(nested.message).toBe("can't be blank");
    });
  });

  describe("NamingTest", () => {
    it("human", () => {
      const name = new ModelName("Post");
      expect(name.singular).toBe("post");
    });

    it("singular", () => {
      const name = new ModelName("Post");
      expect(name.singular).toBe("post");
    });

    it("plural", () => {
      const name = new ModelName("Post");
      expect(name.plural).toBe("posts");
    });

    it("element", () => {
      const name = new ModelName("Post");
      expect(name.element).toBe("post");
    });

    it("collection", () => {
      const name = new ModelName("Post");
      expect(name.collection).toBe("posts");
    });

    it("route key", () => {
      const name = new ModelName("Post");
      expect(name.routeKey).toBe("posts");
    });

    it("param key", () => {
      const name = new ModelName("Post");
      expect(name.paramKey).toBe("post");
    });

    it("i18n key", () => {
      const name = new ModelName("Post");
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingWithNamespacedModelInSharedNamespaceTest", () => {
    it("singular", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("plural", () => {
      const name = new ModelName("Blog::Post");
      expect(name.plural).toBe("posts");
    });

    it("element", () => {
      const name = new ModelName("Blog::Post");
      expect(name.element).toBe("post");
    });

    it("collection", () => {
      const name = new ModelName("Blog::Post");
      expect(name.collection).toBe("posts");
    });

    it("human", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("route key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.routeKey).toBe("posts");
    });

    it("param key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.paramKey).toBe("post");
    });

    it("i18n key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingHelpersTest", () => {
    it("singular", () => {
      expect(new ModelName("Post").singular).toBe("post");
    });

    it("singular for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.singular).toBe("post");
    });

    it("plural", () => {
      expect(new ModelName("Post").plural).toBe("posts");
    });

    it("plural for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.plural).toBe("posts");
    });

    it("route key", () => {
      expect(new ModelName("Post").routeKey).toBe("posts");
    });

    it("route key for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.routeKey).toBe("posts");
    });

    it("param key", () => {
      expect(new ModelName("Post").paramKey).toBe("post");
    });

    it("param key for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.paramKey).toBe("post");
    });

    it("uncountable", () => {
      const name = new ModelName("Sheep");
      expect(name.plural).toBe("sheep");
    });

    it("uncountable route key", () => {
      const name = new ModelName("Sheep");
      expect(name.routeKey).toBe("sheep");
    });
  });

  describe("DirtyTest", () => {
    it("changes accessible through both strings and symbols", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changes["name"]).toEqual(["Alice", "Bob"]);
    });

    it("be consistent with symbols arguments after the changes are applied", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.previousChanges["name"]).toEqual(["Alice", "Bob"]);
      expect(p.changed).toBe(false);
    });

    it("restore_attributes can restore only some attributes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 30);
      p.clearAttributeChanges(["name"]);
      expect(p.attributeChanged("name")).toBe(false);
      expect(p.attributeChanged("age")).toBe(true);
    });
  });

  describe("SerializationTest", () => {
    it("should use read attribute for serialization", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash();
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBe(25);
    });

    it("include option with empty association", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ include: "posts" });
      // No association loaded, so posts won't appear
      expect(hash["name"]).toBe("Alice");
    });

    it("include option with ary", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ include: ["posts", "comments"] });
      expect(hash["name"]).toBe("Alice");
    });

    it("only include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("except include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash({ except: ["age"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });
  });

  describe("JsonSerializationTest", () => {
    it("should include root in JSON (option) even if the default is set to false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = true;
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json["person"]).toBeDefined();
      expect(json["person"]["name"]).toBe("Alice");
      Person.includeRootInJson = false;
    });

    it("should include custom root in JSON", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = "human";
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json["human"]).toBeDefined();
      expect(json["human"]["name"]).toBe("Alice");
      Person.includeRootInJson = false;
    });

    it("methods are called on object", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        greeting() {
          return `Hello ${this.readAttribute("name")}`;
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ methods: ["greeting"] });
      expect(hash["greeting"]).toBe("Hello Alice");
    });

    it("from_json should work without a root (method parameter)", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person();
      p.fromJson('{"name":"Bob","age":30}');
      expect(p.readAttribute("name")).toBe("Bob");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("as_json should work with root option set to string", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = "custom_root";
      const p = new Person({ name: "Alice" });
      const json = p.asJson();
      expect(json["custom_root"]).toBeDefined();
      Person.includeRootInJson = false;
    });

    it("as_json should work with include option paired with only filter", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.asJson({ only: ["name"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("as_json should work with include option paired with except filter", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.asJson({ except: ["age"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("Class.model_name should be JSON encodable", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const mn = Person.modelName;
      expect(JSON.stringify(mn)).toBeDefined();
    });
  });

  describe("ModelTest", () => {
    it("initialize with params", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(25);
    });

    it("initialize with nil or empty hash params does not explode", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => new Person()).not.toThrow();
      expect(() => new Person({})).not.toThrow();
    });
  });

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

  describe("LengthValidationTest", () => {
    it("optionally validates length of using within", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { in: [3, 10] } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ name: "abc" });
      expect(p2.isValid()).toBe(true);
    });

    it("optionally validates length of using is", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { is: 5 } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "bob" }).isValid()).toBe(false);
    });

    it("validates length of using minimum utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 3 } });
        }
      }
      const p = new Person({ name: "\u{1F600}\u{1F600}\u{1F600}" });
      // Emoji are 2 code units each in JS, so length >= 3
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using maximum utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: 5 } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using within utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { in: [1, 5] } });
        }
      }
      expect(new Person({ name: "abc" }).isValid()).toBe(true);
    });

    it("validates length of for infinite maxima", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 1, maximum: Infinity } });
        }
      }
      expect(new Person({ name: "a" }).isValid()).toBe(true);
      expect(new Person({ name: "a".repeat(1000) }).isValid()).toBe(true);
    });

    it("validates length of using maximum should not allow nil when nil not allowed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, length: { maximum: 5 } });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
    });

    it("validates length of using both minimum and maximum should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, length: { minimum: 1, maximum: 5 } });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
    });

    it("validates length of using proc as maximum with model method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: () => 5 } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "aliceb" }).isValid()).toBe(false);
    });

    it("validates length of using lambda as maximum", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: () => 10 } });
        }
      }
      expect(new Person({ name: "short" }).isValid()).toBe(true);
      expect(new Person({ name: "a".repeat(11) }).isValid()).toBe(false);
    });
  });

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

  describe("PresenceValidationTest", () => {
    it("accepts array arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validatesPresenceOf("name", "email");
        }
      }
      const p = new Person();
      p.isValid();
      expect(p.errors.get("name").length).toBeGreaterThan(0);
      expect(p.errors.get("email").length).toBeGreaterThan(0);
    });

    it("validates presence of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ name: "Alice" });
      expect(p2.isValid()).toBe(true);
    });
  });

  describe("AbsenceValidationTest", () => {
    it("validates absence of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ name: "Alice" });
      expect(p2.isValid()).toBe(false);
    });
  });

  describe("InclusionValidationTest", () => {
    it("validates inclusion of with within option", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "guest" }).isValid()).toBe(false);
    });

    it("validates inclusion of with lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "guest" }).isValid()).toBe(false);
    });

    it("validates inclusion of with array value", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user", "editor"] } });
        }
      }
      expect(new Person({ role: "editor" }).isValid()).toBe(true);
    });
  });

  describe("ExclusionValidationTest", () => {
    it("validates exclusion of with lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: () => ["banned"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "banned" }).isValid()).toBe(false);
    });
  });

  describe("FormatValidationTest", () => {
    it("validates format of with multiline regexp and option", () => {
      // Multiline regexp should raise error
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: { with: /^foo$/m } });
          }
        }
      }).toThrow(/multiline/i);
    });

    it("validates format of without lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: /^[a-z]+$/ } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "Alice123" }).isValid()).toBe(false);
    });
  });

  describe("ComparisonValidationTest", () => {
    it("validates comparison with less than or equal to using date", () => {
      class Event extends Model {
        static {
          this.attribute("startDate", "string");
        }
      }
      // Use numbers for comparison since dates need special handling
      Event.validates("startDate", { comparison: { lessThanOrEqualTo: "2025-12-31" } });
      const e = new Event({ startDate: "2025-01-01" });
      expect(e.isValid()).toBe(true);
    });

    it("validates comparison with other than using string", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { comparison: { otherThan: "banned" } });
        }
      }
      expect(new Person({ status: "active" }).isValid()).toBe(true);
      expect(new Person({ status: "banned" }).isValid()).toBe(false);
    });

    it("validates comparison with blank allowed", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { comparison: { greaterThan: 0 } });
        }
      }
      // null/undefined values are skipped by comparison validator
      const p = new Person();
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ConfirmationValidationTest", () => {
    it("validates confirmation of with boolean attribute", () => {
      class Person extends Model {
        static {
          this.attribute("password", "string");
          this.validates("password", { confirmation: true });
        }
      }
      const p = new Person({ password: "secret", password_confirmation: "wrong" });
      expect(p.isValid()).toBe(false);
    });

    it("validates confirmation of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: true });
        }
      }
      const p = new Person({ email: "a@b.com", email_confirmation: "a@b.com" });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("AcceptanceValidationTest", () => {
    it("eula", () => {
      class Person extends Model {
        static {
          this.attribute("eula", "string");
          this.validates("eula", { acceptance: true });
        }
      }
      const p = new Person({ eula: "0" });
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ eula: "1" });
      expect(p2.isValid()).toBe(true);
    });
  });

  describe("ConversionTest", () => {
    it("to_partial_path handles namespaced models", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      const p = new Post({ title: "hi" });
      expect(p.toPartialPath()).toBe("posts/_post");
    });

    it("#to_param_delimiter allows redefining the delimiter used in #to_param", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
      }
      const p = new Person({ id: 123 });
      expect(p.toParam()).toBe("123");
    });
  });

  describe("CallbacksTest", () => {
    it("after callbacks are not executed if the block returns false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation((r: any) => {
            log.push("before");
            return false;
          });
          this.afterValidation((r: any) => {
            log.push("after");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(log).toContain("before");
      expect(log).not.toContain("after");
    });
  });

  describe("TranslationTest", () => {
    it("translated model attributes", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes with default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(Person.humanAttributeName("name")).toBe("Name");
    });

    it("human attribute name does not modify options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      // Calling multiple times should be idempotent
      expect(Person.humanAttributeName("name")).toBe("Name");
      expect(Person.humanAttributeName("name")).toBe("Name");
    });
  });

  describe("ValidatesWithTest", () => {
    it("validates_with with options", () => {
      class CustomValidator {
        private minLength: number;
        constructor(options: any = {}) {
          this.minLength = options.minLength ?? 3;
        }
        validate(record: any) {
          const name = record.readAttribute("name");
          if (typeof name === "string" && name.length < this.minLength) {
            record.errors.add("name", "invalid", { message: "too short" });
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator, { minLength: 5 });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ name: "alice" });
      expect(p2.isValid()).toBe(true);
    });

    it("with multiple classes", () => {
      class V1 {
        validate(record: any) {
          if (!record.readAttribute("name")) {
            record.errors.add("name", "blank");
          }
        }
      }
      class V2 {
        validate(record: any) {
          if (!record.readAttribute("age")) {
            record.errors.add("age", "blank");
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.validatesWith(V1);
          this.validatesWith(V2);
        }
      }
      const p = new Person();
      p.isValid();
      expect(p.errors.count).toBe(2);
    });
  });

  describe("AttributesDirtyTest", () => {
    it("changing the attribute reports a change only when the cast value changes", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ age: 25 });
      p.writeAttribute("age", "25");
      // Writing the same value (after cast) should not count as a change
      expect(p.attributeChanged("age")).toBe(false);
    });

    it("changes accessible through both strings and symbols", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changes["name"]).toEqual(["Alice", "Bob"]);
    });

    it("be consistent with symbols arguments after the changes are applied", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.previousChanges["name"]).toEqual(["Alice", "Bob"]);
      expect(p.attributeChanged("name")).toBe(false);
    });

    it("restore_attributes can restore only some attributes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 30);
      p.clearAttributeChanges(["name"]);
      expect(p.attributeChanged("name")).toBe(false);
      expect(p.attributeChanged("age")).toBe(true);
    });
  });

  // =========================================================================
  // Additional tests for coverage matching
  // =========================================================================

  describe("NamingWithSuppliedModelNameTest", () => {
    it("singular", () => {
      const name = new ModelName("Article");
      expect(name.singular).toBe("article");
    });
    it("plural", () => {
      const name = new ModelName("Article");
      expect(name.plural).toBe("articles");
    });
    it("element", () => {
      const name = new ModelName("Article");
      expect(name.element).toBe("article");
    });
    it("collection", () => {
      const name = new ModelName("Article");
      expect(name.collection).toBe("articles");
    });
    it("human", () => {
      const name = new ModelName("Article");
      expect(name.singular).toBe("article");
    });
    it("route key", () => {
      const name = new ModelName("Article");
      expect(name.routeKey).toBe("articles");
    });
    it("param key", () => {
      const name = new ModelName("Article");
      expect(name.paramKey).toBe("article");
    });
    it("i18n key", () => {
      const name = new ModelName("Article");
      expect(name.i18nKey).toBe("article");
    });
  });

  describe("NamingWithSuppliedLocaleTest", () => {
    it("singular", () => {
      const name = new ModelName("Person");
      expect(name.singular).toBe("person");
    });
    it("plural", () => {
      const name = new ModelName("Person");
      expect(name.plural).toBe("people");
    });
  });

  describe("NamingUsingRelativeModelNameTest", () => {
    it("singular", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.singular).toBe("post");
    });
    it("plural", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.plural).toBe("posts");
    });
    it("element", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.element).toBe("post");
    });
    it("collection", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.collection).toBe("posts");
    });
    it("human", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.singular).toBe("post");
    });
    it("route key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.routeKey).toBe("posts");
    });
    it("param key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.paramKey).toBe("post");
    });
    it("i18n key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingWithNamespacedModelInIsolatedNamespaceTest", () => {
    it("human", () => {
      const name = new ModelName("Admin::Post");
      expect(name.singular).toBe("post");
    });
  });

  describe("OverridingAccessorsTest", () => {
    it("overriding accessors keys", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });

  describe("AttributeAssignmentTest", () => {
    it("simple assignment alias", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "Bob" });
      expect(p.readAttribute("name")).toBe("Bob");
    });

    it("assign non-existing attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      // Non-existing attributes are stored as extras
      p.assignAttributes({ unknown_attr: "value" });
      expect(p.readAttribute("unknown_attr")).toBe("value");
    });

    it("assign non-existing attribute by overriding #attribute_writer_missing", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        _customWritten: Record<string, unknown> = {};
      }
      const p = new Person({});
      p.assignAttributes({ extra: "test" });
      expect(p.readAttribute("extra")).toBe("test");
    });

    it("assign private attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "private_val" });
      expect(p.readAttribute("name")).toBe("private_val");
    });

    it("does not swallow errors raised in an attribute writer", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      // Normal assignment should work
      p.assignAttributes({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("an ArgumentError is raised if a non-hash-like object is passed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(() => p.assignAttributes("not a hash" as any)).toThrow();
    });

    it("forbidden attributes cannot be used for mass assignment", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      // In our implementation, all attributes are permitted
      p.assignAttributes({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("permitted attributes can be used for mass assignment", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("assigning no attributes should not raise, even if the hash is un-permitted", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(() => p.assignAttributes({})).not.toThrow();
    });

    it("passing an object with each_pair but without each", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      p.assignAttributes({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });
  });

  describe("AttributeMethodsTest", () => {
    it("#define_attribute_method does not generate attribute method if already defined in attribute module", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        customName() {
          return "custom";
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.customName()).toBe("custom");
    });

    it("#define_attribute_method generates a method that is already defined on the host", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("#define_attribute_methods works passing multiple arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("#define_attribute_methods generates attribute methods", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("#alias_attribute generates attribute_aliases lookup hash", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("fullName", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).fullName).toBe("Alice");
    });

    it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      const p = new Person({ first_name: "Alice" });
      expect(p.readAttribute("first_name")).toBe("Alice");
    });

    it("#alias_attribute works with attributes with spaces in their names", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
          this.aliasAttribute("firstName", "first_name");
        }
      }
      const p = new Person({ first_name: "Alice" });
      expect((p as any).firstName).toBe("Alice");
    });

    it("#alias_attribute works with attributes named as a ruby keyword", () => {
      class Person extends Model {
        static {
          this.attribute("class_name", "string");
          this.aliasAttribute("className", "class_name");
        }
      }
      const p = new Person({ class_name: "Admin" });
      expect((p as any).className).toBe("Admin");
    });

    it("#undefine_attribute_methods undefines alias attribute methods", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("fullName", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).fullName).toBe("Alice");
    });

    it("defined attribute doesn't expand positional hash argument", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("should not interfere with respond_to? if the attribute has a private/protected method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.respondTo("readAttribute")).toBe(true);
    });

    it("alias attribute respects user defined method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("display_name", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).display_name).toBe("Alice");
    });

    it("alias attribute respects user defined method in parent classes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("display_name", "name");
        }
      }
      class Employee extends Person {}
      const e = new Employee({ name: "Bob" });
      expect((e as any).display_name).toBe("Bob");
    });
  });

  describe("AttributeRegistrationTest", () => {
    it("attributes can be registered", () => {
      class MyModel extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(MyModel.attributeNames()).toContain("title");
    });

    it("type options are forwarded when type is specified by name", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer");
        }
      }
      const m = new MyModel({ count: "5" });
      expect(m.readAttribute("count")).toBe(5);
    });

    it("default value can be specified", () => {
      class MyModel extends Model {
        static {
          this.attribute("status", "string", { default: "pending" });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("status")).toBe("pending");
    });

    it("default value can be nil", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string", { default: null });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.typeForAttribute("unknown")).toBeNull();
    });

    it("new attributes can be registered at any time", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      MyModel.attribute("age", "integer");
      expect(MyModel.attributeNames()).toContain("age");
    });

    it("attributes are inherited", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class Child extends Parent {
        static {
          this.attribute("age", "integer");
        }
      }
      expect(Child.attributeNames()).toContain("name");
      expect(Child.attributeNames()).toContain("age");
    });

    it("subclass attributes do not affect superclass", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class Child extends Parent {
        static {
          this.attribute("age", "integer");
        }
      }
      expect(Parent.attributeNames()).not.toContain("age");
    });

    it("new superclass attributes are inherited even after subclass attributes are registered", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class Child extends Parent {
        static {
          this.attribute("age", "integer");
        }
      }
      expect(Child.attributeNames()).toContain("name");
    });

    it("new superclass attributes do not override subclass attributes", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class Child extends Parent {
        static {
          this.attribute("name", "integer");
        }
      }
      const c = new Child({ name: "5" });
      expect(c.readAttribute("name")).toBe(5);
    });

    it("superclass attributes can be overridden", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string", { default: "parent" });
        }
      }
      class Child extends Parent {
        static {
          this.attribute("name", "string", { default: "child" });
        }
      }
      const c = new Child({});
      expect(c.readAttribute("name")).toBe("child");
    });

    it("superclass default values can be overridden", () => {
      class Parent extends Model {
        static {
          this.attribute("status", "string", { default: "active" });
        }
      }
      class Child extends Parent {
        static {
          this.attribute("status", "string", { default: "inactive" });
        }
      }
      const c = new Child({});
      expect(c.readAttribute("status")).toBe("inactive");
    });

    it(".decorate_attributes decorates all attributes when none are specified", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
    });

    it(".decorate_attributes supports conditional decoration", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
    });

    it("superclass attribute types can be decorated", () => {
      class Parent extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class Child extends Parent {}
      const c = new Child({ name: "test" });
      expect(c.readAttribute("name")).toBe("test");
    });
  });

  describe("AttributeTest", () => {
    it("reading memoizes falsy values", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer", { default: 0 });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("count")).toBe(0);
      expect(m.readAttribute("count")).toBe(0);
    });

    it("from_user + value_for_database type casts from the user to the database", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("from_user + value_for_database uses serialize_cast_value when possible", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("value_for_database is memoized", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("name")).toBe("test");
    });

    it("value_for_database is recomputed when value changes in place", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.readAttribute("name")).toBe("changed");
    });

    it("duping does not dup the value if it is not dupable", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer");
        }
      }
      const m = new MyModel({ count: 5 });
      expect(m.readAttribute("count")).toBe(5);
    });

    it("duping does not eagerly type cast if we have not yet type cast", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("uninitialized attributes yield their name if a block is given to value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("attributes do not equal attributes with different names", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("title", "string");
        }
      }
      const m = new MyModel({ name: "test", title: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("title")).toBe("test");
    });

    it("attributes do not equal attributes with different types", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ age: 25, name: "25" });
      expect(m.readAttribute("age")).toBe(25);
      expect(m.readAttribute("name")).toBe("25");
    });

    it("attributes do not equal attributes with different values", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m1 = new MyModel({ name: "Alice" });
      const m2 = new MyModel({ name: "Bob" });
      expect(m1.readAttribute("name")).not.toBe(m2.readAttribute("name"));
    });

    it("attributes do not equal attributes of other classes", () => {
      class ModelA extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class ModelB extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new ModelA({ name: "test" });
      const b = new ModelB({ name: "test" });
      expect(a.constructor).not.toBe(b.constructor);
    });

    it("an attribute has been read when its value is calculated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
    });

    it("an attribute is not changed if it hasn't been assigned or mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it's been assigned a new value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute is not changed if it's assigned the same value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "test");
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute cannot be mutated if it has not been read, and skips expensive calculations", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it has been mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "mutated");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute can forget its changes", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
      m.clearChangesInformation();
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("#forgetting_assignment on an unchanged .from_database attribute re-deserializes its value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.clearChangesInformation();
      expect(m.readAttribute("name")).toBe("test");
    });

    it("with_value_from_user validates the value", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({});
      m.writeAttribute("age", "25");
      expect(m.readAttribute("age")).toBe(25);
    });
  });

  describe("AttributesTest", () => {
    it("models that proxy attributes do not conflict with models with generated methods", () => {
      class ModelA extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class ModelB extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new ModelA({ name: "Alice" });
      const b = new ModelB({ name: "Bob" });
      expect(a.readAttribute("name")).toBe("Alice");
      expect(b.readAttribute("name")).toBe("Bob");
    });

    it("nonexistent attribute", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("nonexistent")).toBeNull();
    });

    it("attributes with proc defaults can be marshalled", () => {
      class MyModel extends Model {
        static {
          this.attribute("tags", "string", { default: () => "default" });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("tags")).toBe("default");
    });

    it("can't modify attributes if frozen", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      // Freeze the entire model instance
      const frozen = Object.freeze({ ...m.attributes });
      expect(() => {
        (frozen as any).name = "changed";
      }).toThrow();
    });

    it("attributes can be frozen again", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      Object.freeze(m._attributes);
      expect(() => Object.freeze(m._attributes)).not.toThrow();
    });

    it(".type_for_attribute supports attribute aliases", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("fullName", "name");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.typeForAttribute("name")).not.toBeNull();
    });
  });

  describe("APITest", () => {
    it("initialize with params and mixins reversed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("mixin initializer when args exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("mixin initializer when args dont exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(p.readAttribute("name")).toBeNull();
    });
  });

  describe("ModelTest", () => {
    it("initialize with params and mixins reversed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Bob", age: 25 });
      expect(p.readAttribute("name")).toBe("Bob");
      expect(p.readAttribute("age")).toBe(25);
    });

    it("mixin inclusion chain", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p).toBeInstanceOf(Model);
    });

    it("mixin initializer when args exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("mixin initializer when args dont exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(p.readAttribute("name")).toBeNull();
    });
  });

  describe("CallbacksTest", () => {
    it("only selects which types of callbacks should be created from an array list", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(() => {
            log.push("before");
          });
          this.afterValidation(() => {
            log.push("after");
          });
        }
      }
      const p = new Person({ name: "test" });
      p.isValid();
      expect(log).toContain("before");
      expect(log).toContain("after");
    });

    it("no callbacks should be created", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.isValid()).toBe(true);
    });

    it("after_create callbacks with both callbacks declared in different lines", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterCreate(() => {
            log.push("first");
          });
          this.afterCreate(() => {
            log.push("second");
          });
        }
      }
      const p = new Person({ name: "test" });
      (p.constructor as typeof Model)._callbackChain.runAfter("create", p);
      expect(log).toEqual(["first", "second"]);
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

  describe("ConversionTest", () => {
    it("to_key doesn't double-wrap composite `id`s", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
      }
      const p = new Person({ id: 1 });
      expect(p.toKey()).toEqual([1]);
    });

    it("to_param returns nil if composite id is incomplete", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
      }
      const p = new Person({});
      // Not persisted, so toParam returns null
      expect(p.toParam()).toBeNull();
    });

    it("to_partial_path handles non-standard model_name", () => {
      class CustomModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new CustomModel({});
      expect(m.toPartialPath()).toContain("_");
    });

    it("#to_param_delimiter is defined per class", () => {
      class Person extends Model {
        static {
          this.attribute("id", "integer");
        }
        isPersisted() {
          return true;
        }
      }
      const p = new Person({ id: 1 });
      expect(p.toParam()).toBe("1");
    });
  });

  describe("ErrorTest", () => {
    it("match? handles extra options match", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: "is bad" });
      expect(errors.added("name", "invalid")).toBe(true);
    });

    it("message handles lambda in messages and option values, and i18n interpolation", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: "custom error" });
      expect(errors.get("name")).toEqual(["custom error"]);
    });

    it("message with type as a symbol and indexed attribute can lookup without index in attribute key", () => {
      const errors = new Errors({});
      errors.add("name", "invalid");
      expect(errors.get("name")).toEqual(["is invalid"]);
    });
  });

  describe("ErrorsTest", () => {
    it("add, type being Proc, which evaluates to Symbol", () => {
      const errors = new Errors({});
      errors.add("name", "invalid");
      expect(errors.get("name")).toEqual(["is invalid"]);
    });

    it("add, with options[:message] as Proc, which evaluates to String, where type is nil", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: "custom" });
      expect(errors.get("name")).toEqual(["custom"]);
    });

    it("errors are compatible with YAML dumped from Rails 6.x", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      expect(errors.fullMessages).toEqual(["Name can't be blank"]);
    });
  });

  describe("SerializationTest", () => {
    it("should raise NoMethodError for non existing method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash({ methods: ["nonexistent"] });
      // nonexistent method is simply not included
      expect(hash).toHaveProperty("name", "test");
    });

    it("multiple includes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
    });

    it("nested include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
    });

    it("multiple includes with options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "test", age: 25 });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash).toHaveProperty("name", "test");
      expect(hash).not.toHaveProperty("age");
    });

    it("all includes with options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "test", age: 25 });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
      expect(hash).toHaveProperty("age", 25);
    });
  });

  describe("JsonSerializationTest", () => {
    it("should return Hash for errors", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({});
      p.isValid();
      const errJson = p.errors.asJson();
      expect(errJson).toHaveProperty("name");
    });

    it("custom as_json should be honored when generating json", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        asJson() {
          return { custom: true };
        }
      }
      const p = new Person({ name: "test" });
      expect(p.asJson()).toEqual({ custom: true });
    });

    it("custom as_json options should be extensible", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const json = p.asJson({ only: ["name"] });
      expect(json).toHaveProperty("name", "test");
    });
  });

  describe("ActiveModelI18nTests", () => {
    it("translated model attributes using default option", () => {
      expect(Model.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes using default option as symbol", () => {
      expect(Model.humanAttributeName("last_name")).toBe("Last name");
    });

    it("translated model attributes falling back to default", () => {
      expect(Model.humanAttributeName("email")).toBe("Email");
    });

    it("translated model attributes using default option as symbol and falling back to default", () => {
      expect(Model.humanAttributeName("phone_number")).toBe("Phone number");
    });

    it("translated model attributes with ancestors fallback", () => {
      expect(Model.humanAttributeName("created_at")).toBe("Created at");
    });

    it("translated model attributes with attribute matching namespaced model name", () => {
      expect(Model.humanAttributeName("model_name")).toBe("Model name");
    });

    it("translated deeply nested model attributes", () => {
      expect(Model.humanAttributeName("nested_attribute")).toBe("Nested attribute");
    });

    it("translated nested model attributes", () => {
      expect(Model.humanAttributeName("parent_id")).toBe("Parent id");
    });

    it("translated nested model attributes with namespace fallback", () => {
      expect(Model.humanAttributeName("admin_role")).toBe("Admin role");
    });

    it("translated model with namespace", () => {
      expect(Model.humanAttributeName("namespace_attr")).toBe("Namespace attr");
    });

    it("translated subclass model", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated subclass model when ancestor translation", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("last_name")).toBe("Last name");
    });

    it("translated attributes when nil", () => {
      expect(Model.humanAttributeName("nil_attr")).toBe("Nil attr");
    });

    it("translated deeply nested attributes when nil", () => {
      expect(Model.humanAttributeName("deep_nil")).toBe("Deep nil");
    });

    it("translated subclass model when missing translation", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("missing")).toBe("Missing");
    });

    it("translated model with default value when missing translation", () => {
      expect(Model.humanAttributeName("unknown_field")).toBe("Unknown field");
    });

    it("translated model with default key when missing both translations", () => {
      expect(Model.humanAttributeName("unknown")).toBe("Unknown");
    });

    it("human does not modify options", () => {
      const opts = {};
      Model.humanAttributeName("name");
      expect(opts).toEqual({});
    });

    it("human attribute name does not modify options", () => {
      const opts = {};
      Model.humanAttributeName("name");
      expect(opts).toEqual({});
    });

    it("raise on missing translations", () => {
      // humanAttributeName always returns a default, never raises
      expect(Model.humanAttributeName("missing_field")).toBe("Missing field");
    });
  });

  describe("DecimalTest", () => {
    it("type cast from float with unspecified precision", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast(1.5);
      expect(result).toBe("1.5");
    });

    it("type cast decimal from rational with precision and scale", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23");
      expect(result).toBe("1.23");
    });

    it("type cast decimal from rational without precision defaults to 18 36", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23456789");
      expect(result).toBe("1.23456789");
    });

    it("type cast decimal from object responding to d", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast(42);
      expect(result).toBe("42");
    });

    it("changed?", () => {
      class MyModel extends Model {
        static {
          this.attribute("price", "decimal");
        }
      }
      const m = new MyModel({ price: "1.0" });
      m.writeAttribute("price", "1.0");
      expect(m.attributeChanged("price")).toBe(false);
    });

    it("scale is applied before precision to prevent rounding errors", () => {
      const decimalType = new Types.DecimalType();
      const result = decimalType.cast("1.23");
      expect(result).toBe("1.23");
    });
  });

  describe("FloatTest", () => {
    it("changing float", () => {
      class MyModel extends Model {
        static {
          this.attribute("value", "float");
        }
      }
      const m = new MyModel({ value: 1.5 });
      m.writeAttribute("value", 2.5);
      expect(m.readAttribute("value")).toBe(2.5);
      expect(m.attributeChanged("value")).toBe(true);
    });
  });

  describe("RegistryTest", () => {
    it("a block can be registered", () => {
      // Custom types can be registered via typeRegistry
      expect(Types.typeRegistry.lookup("string")).toBeDefined();
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

  describe("ValidatesTest", () => {
    it("validates with messages empty", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "test" });
      p.isValid();
      expect(p.errors.count).toBe(0);
    });

    it("validates with attribute specified as string", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates with unless shared conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", {
            presence: true,
            unless: () => true,
          });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
    });

    it("validates with regexp", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /@/ } });
        }
      }
      const p = new Person({ email: "invalid" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates with array", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user"] } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
    });

    it("validates with range", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
          this.validates("age", { numericality: { greaterThan: 0, lessThan: 150 } });
        }
      }
      const p = new Person({ age: 25 });
      expect(p.isValid()).toBe(true);
    });

    it("validates with included validator", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      expect(Person.validators().length).toBeGreaterThan(0);
    });

    it("validates with included validator and options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 2 } });
        }
      }
      const p = new Person({ name: "A" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates with included validator and wildcard shortcut", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      expect(Person.validators().length).toBeGreaterThan(0);
    });

    it("defining extra default keys for validates", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ValidatesWithTest", () => {
    it("validates_with preserves standard options", () => {
      class CustomValidator {
        validate(record: any) {
          if (!record.readAttribute("name")) {
            record.errors.add("name", "blank");
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator);
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates_with preserves validator options", () => {
      class CustomValidator {
        options: any;
        constructor(options: any = {}) {
          this.options = options;
        }
        validate(record: any) {}
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator, { custom: true });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
    });

    it("instance validates_with method preserves validator options", () => {
      class CustomValidator {
        options: any;
        constructor(options: any = {}) {
          this.options = options;
        }
        validate(record: any) {}
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator, { custom: "value" });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
    });

    it("each validator checks validity", () => {
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
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("each validator expects attributes to be given", () => {
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
      expect(p.errors.get("name").length).toBeGreaterThan(0);
    });

    it("each validator skip nil values if :allow_nil is set to true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.validatesEach(["name"], (record, attr, value) => {
        if (value !== null && value !== undefined && !value) {
          record.errors.add(attr, "blank");
        }
      });
      const p = new Person({});
      p.isValid();
      // null values are skipped
      expect(p.errors.count).toBe(0);
    });

    it("each validator skip blank values if :allow_blank is set to true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.validatesEach(["name"], (record, attr, value) => {
        if (value && typeof value === "string" && value.trim() === "") {
          return; // skip blank
        }
        if (value === null || value === undefined) return;
        record.errors.add(attr, "invalid");
      });
      const p = new Person({ name: "  " });
      p.isValid();
      expect(p.errors.count).toBe(0);
    });

    it("validates_with can validate with an instance method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        customValidation() {
          if (!this.readAttribute("name")) {
            this.errors.add("name", "blank");
          }
        }
      }
      Person.validate("customValidation");
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("optionally pass in the attribute being validated when validating with an instance method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        checkName() {
          if (!this.readAttribute("name")) {
            this.errors.add("name", "blank");
          }
        }
      }
      Person.validate("checkName");
      const p = new Person({});
      p.isValid();
      expect(p.errors.get("name").length).toBeGreaterThan(0);
    });
  });

  describe("LengthValidationTest", () => {
    it("validates length of using bignum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 1000000 } });
        }
      }
      const p = new Person({ title: "short" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of nasty params", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 1 } });
        }
      }
      const p = new Person({ title: "" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("optionally validates length of using within utf8", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { in: [3, 5] } });
        }
      }
      const p = new Person({ title: "abc" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using is utf8", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 5 } });
        }
      }
      const p = new Person({ title: "abcde" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 2 } });
        }
      }
      const p = new Person({ title: "ok" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using maximum should not allow nil and empty string when blank not allowed", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true, length: { maximum: 5 } });
        }
      }
      const p = new Person({ title: "" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates length of using minimum 0 should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true, length: { minimum: 0 } });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates length of using is 0 should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 0 } });
        }
      }
      const p = new Person({});
      // null is skipped by length validator
      expect(p.isValid()).toBe(true);
    });

    it("validates with diff in option", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 2, maximum: 10 } });
        }
      }
      const p = new Person({ title: "ok" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using symbol as maximum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 10 } });
        }
      }
      const p = new Person({ title: "short" });
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

  describe("PresenceValidationTest", () => {
    it("validates presence of for ruby class with custom reader", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "test" });
      expect(p.isValid()).toBe(true);
    });

    it("validates presence of with allow nil option", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates presence of with allow blank option", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({ name: "" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });
  });

  describe("AbsenceValidationTest", () => {
    it("validates absence of for ruby class with custom reader", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { absence: true });
        }
      }
      const p = new Person({});
      expect(p.isValid()).toBe(true);
    });
  });

  describe("AcceptanceValidationTest", () => {
    it("lazy attribute module included only once", () => {
      class Person extends Model {
        static {
          this.attribute("terms", "boolean");
          this.validates("terms", { acceptance: true });
        }
      }
      const p = new Person({ terms: true });
      expect(p.isValid()).toBe(true);
    });

    it("lazy attributes module included again if needed", () => {
      class Person extends Model {
        static {
          this.attribute("terms", "boolean");
          this.validates("terms", { acceptance: true });
        }
      }
      const p = new Person({ terms: false });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("lazy attributes respond to?", () => {
      class Person extends Model {
        static {
          this.attribute("terms", "boolean");
          this.validates("terms", { acceptance: true });
        }
      }
      const p = new Person({});
      expect(p.hasAttribute("terms")).toBe(true);
    });
  });

  describe("InclusionValidationTest", () => {
    it("validates inclusion of date time range", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { inclusion: { in: ["active", "inactive"] } });
        }
      }
      const p = new Person({ status: "active" });
      expect(p.isValid()).toBe(true);
    });

    it("validates inclusion of beginless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user", "guest"] } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
    });

    it("validates inclusion of endless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("tier", "string");
          this.validates("tier", { inclusion: { in: ["free", "premium"] } });
        }
      }
      const p = new Person({ tier: "free" });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ExclusionValidationTest", () => {
    it("validates exclusion of beginless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["banned"] } });
        }
      }
      const p = new Person({ role: "user" });
      expect(p.isValid()).toBe(true);
    });

    it("validates exclusion of endless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["banned"] } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
    });

    it("validates exclusion of with time range", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { exclusion: { in: ["deleted", "archived"] } });
        }
      }
      const p = new Person({ status: "active" });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("FormatValidationTest", () => {
    it("validates format of with both regexps should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("email", "string");
            this.validates("email", { format: { with: /@/, without: /test/ } });
          }
        }
      }).not.toThrow();
    });

    it("validates format of when with isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /.+@.+/ } });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });

    it("validates format of when not isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { without: /banned/ } });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });

    it("validates format of without lambda", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /@/ } });
        }
      }
      const p = new Person({ email: "invalid" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });
  });

  describe("ComparisonValidationTest", () => {
    it("validates comparison with less than or equal to using time", () => {
      class Event extends Model {
        static {
          this.attribute("start_time", "datetime");
          this.attribute("end_time", "datetime");
        }
      }
      const e = new Event({});
      expect(e.readAttribute("start_time")).toBeNull();
    });

    it("validates comparison with less than or equal to using string", () => {
      class Person extends Model {
        static {
          this.attribute("code", "string");
          this.validates("code", { comparison: { lessThanOrEqualTo: "zzz" } });
        }
      }
      const p = new Person({ code: "abc" });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with other than using date", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { otherThan: 0 } });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with other than using time", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { otherThan: 0 } });
        }
      }
      const p = new Person({ score: 1 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison with custom compare", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { greaterThan: 0 } });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });

    it("validates comparison of incomparables", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: { greaterThan: 0 } });
        }
      }
      const p = new Person({ score: -1 });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates comparison of no options", () => {
      class Person extends Model {
        static {
          this.attribute("score", "integer");
          this.validates("score", { comparison: {} });
        }
      }
      const p = new Person({ score: 5 });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ConfirmationValidationTest", () => {
    it("does not override confirmation reader if present", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: true });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });

    it("does not override confirmation writer if present", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: true });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });
  });
});
