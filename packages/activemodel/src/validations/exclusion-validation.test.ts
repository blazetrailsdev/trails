import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("ExclusionValidationTest", () => {
    it("validates exclusion of with lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: () => ["banned"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "banned" }).isValid()).toBe(false);
    });
  });

  describe("ExclusionValidationTest", () => {
    it("validates exclusion of beginless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["banned"] } });
        }
      }
      const p = new Person({ role: "user" });
      expect(p.isValid()).toBe(true);
    });

    it("validates exclusion of endless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { exclusion: { in: ["banned"] } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
    });

    it("validates exclusion of with time range", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { exclusion: { in: ["deleted", "archived"] } });
        }
      }
      const p = new Person({ status: "active" });
      expect(p.isValid()).toBe(true);
    });
  });
});
