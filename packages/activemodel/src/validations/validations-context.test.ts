import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";

describe("ActiveModel", () => {
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
});
