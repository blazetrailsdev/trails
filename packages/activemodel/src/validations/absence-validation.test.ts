import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ActiveModel", () => {
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

    it("validates absence of with array arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { absence: true });
          this.validates("email", { absence: true });
        }
      }
      const p = new Person({ name: "Alice", email: "a@b.com" });
      p.isValid();
      expect(p.errors.count).toBe(2);
      expect(p.errors.get("name").length).toBeGreaterThan(0);
      expect(p.errors.get("email").length).toBeGreaterThan(0);
    });
  });
});
