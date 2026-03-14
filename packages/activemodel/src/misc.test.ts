import { describe, it, expect } from "vitest";
import { Model, Types } from "./index.js";

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
        expect(w.errors.get("name")[0]).toMatch(/is too short/);
      });

      it("validates length of using maximum", () => {
        const w = new WithLength({ name: "abcdefghijk" });
        expect(w.isValid()).toBe(false);
        expect(w.errors.get("name")[0]).toMatch(/is too long/);
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
        expect(f.errors.get("count")).toContain("must be an integer");
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
        expect(w.errors.get("password")).toContain("doesn't match Password");
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
      (Payment as any).beforeProcess((_record: any) => {
        log.push("before_process");
      });
      (Payment as any).afterProcess((_record: any) => {
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
});
