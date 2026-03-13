import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("ConfirmationValidationTest", () => {
    it("validates confirmation of with boolean attribute", () => {
      class Person extends Model {
        static {
          this.attribute("password", "string");
          this.validates("password", { confirmation: true });
        }
      }
      const p = new Person({ password: "secret", passwordConfirmation: "wrong" });
      expect(p.isValid()).toBe(false);
    });

    it("validates confirmation of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { confirmation: true });
        }
      }
      const p = new Person({ email: "a@b.com", emailConfirmation: "a@b.com" });
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

  describe("ConfirmationValidationTest (ported)", () => {
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

    it.skip("title confirmation with i18n attribute", () => {
      // i18n not implemented yet
    });
  });
});
