import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";

describe("ActiveModel", () => {
  describe("Validations Context (ported)", () => {
    it("with a class that adds errors on create and validating a new model with no arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      // No context specified, so validation with on: "create" is skipped
      expect(new Person({}).isValid()).toBe(true);
    });

    it("with a class that adds errors on create and validating a new model", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      expect(new Person({}).isValid("create")).toBe(false);
    });

    it("with a class that adds errors on update and validating a new model", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "update" });
        }
      }
      expect(new Person({}).isValid("create")).toBe(true);
      expect(new Person({}).isValid("update")).toBe(false);
    });

    it("with a class that adds errors on multiple contexts and validating a new model", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true, on: "create" });
          this.validates("email", { presence: true, on: "update" });
        }
      }
      // On create: only name validation fires
      const p1 = new Person({});
      expect(p1.isValid("create")).toBe(false);
      expect(p1.errors.get("name").length).toBeGreaterThan(0);

      const p2 = new Person({ name: "Alice" });
      expect(p2.isValid("create")).toBe(true);
    });

    it("with a class that validating a model for a multiple contexts", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, on: "create" });
        }
      }
      // Without context, validation is skipped
      expect(new Person({}).isValid()).toBe(true);
      // With matching context, validation runs
      expect(new Person({}).isValid("create")).toBe(false);
      // With non-matching context, validation is skipped
      expect(new Person({}).isValid("update")).toBe(true);
    });
  });
});
