import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

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
      // Rails BooleanType: "yes"/"no" both truthy (neither in FALSE_VALUES).
      expect(new User({ active: "false" }).readAttribute("active")).toBe(false);
      expect(new User({ active: "true" }).readAttribute("active")).toBe(true);
      expect(new User({ active: "yes" }).readAttribute("active")).toBe(true);
      expect(new User({ active: "no" }).readAttribute("active")).toBe(true);
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
    it("prepend: true puts callback first in the chain", async () => {
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

      // Validations only run with "create" context, not without
      const user = new User();
      expect(user.isValid()).toBe(true);
      expect(user.isValid("create")).toBe(false);
      expect(user.errors.on("name")).toContain("can't be blank");
      expect(user.errors.on("email")).toContain("can't be blank");
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
