import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ActiveModel", () => {
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
});
