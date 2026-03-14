import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ActiveModel", () => {
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

  describe("ValidatesTest (ported)", () => {
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
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { foobar: false } as any);
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("ValidatesTest", () => {
    it("validates with if as shared conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.validates("name", {
            presence: true,
            length: { minimum: 3 },
            if: (r: any) => r.readAttribute("active") === true,
          });
        }
      }
      // When inactive, both validations should be skipped
      expect(new Person({ active: false }).isValid()).toBe(true);
      // When active, both validations should run
      expect(new Person({ active: true }).isValid()).toBe(false);
      expect(new Person({ active: true, name: "abc" }).isValid()).toBe(true);
    });

    it("validates with allow nil shared conditions", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", {
            numericality: true,
            allowNil: true,
          });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
      expect(new Person({ value: "42" }).isValid()).toBe(true);
      expect(new Person({ value: "abc" }).isValid()).toBe(false);
    });

    it("validates with validator class and options", () => {
      class CustomValidator {
        private min: number;
        constructor(options: any = {}) {
          this.min = options.minimum ?? 0;
        }
        validate(record: any) {
          const val = record.readAttribute("name");
          if (typeof val === "string" && val.length < this.min) {
            record.errors.add("name", "too_short", { message: "is too short" });
          }
        }
      }
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validatesWith(CustomValidator, { minimum: 5 });
        }
      }
      expect(new Person({ name: "ab" }).isValid()).toBe(false);
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
    });
  });
});
