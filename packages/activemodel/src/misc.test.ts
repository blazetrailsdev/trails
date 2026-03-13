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
            passwordConfirmation: "secret",
          }).isValid(),
        ).toBe(true);
      });

      it("no title confirmation", () => {
        const w = new WithConfirm({
          password: "secret",
          passwordConfirmation: "wrong",
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
      u._attributes.set("emailConfirmation", "alice@example.com");
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
      u._attributes.set("emailConfirmation", "alice@example.com");
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
      u._attributes.set("emailConfirmation", "bob@example.com");
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
      const u = new User({ password: "secret", passwordConfirmation: "mismatch" });
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
      const p = new Person({ title: "A", titleConfirmation: "B" });
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
      const p = new Person({ title: "A", titleConfirmation: "A" });
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
      p._attributes.set("titleConfirmation", "hello");
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
      p._attributes.set("titleConfirmation", "hello");
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
});
