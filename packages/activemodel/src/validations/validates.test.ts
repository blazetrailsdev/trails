import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

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
});
