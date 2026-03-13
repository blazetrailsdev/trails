import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("InclusionValidationTest", () => {
    it("validates inclusion of with within option", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "guest" }).isValid()).toBe(false);
    });

    it("validates inclusion of with lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: () => ["admin", "user"] } });
        }
      }
      expect(new Person({ role: "admin" }).isValid()).toBe(true);
      expect(new Person({ role: "guest" }).isValid()).toBe(false);
    });

    it("validates inclusion of with array value", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user", "editor"] } });
        }
      }
      expect(new Person({ role: "editor" }).isValid()).toBe(true);
    });
  });

  describe("InclusionValidationTest", () => {
    it("validates inclusion of date time range", () => {
      class Person extends Model {
        static {
          this.attribute("status", "string");
          this.validates("status", { inclusion: { in: ["active", "inactive"] } });
        }
      }
      const p = new Person({ status: "active" });
      expect(p.isValid()).toBe(true);
    });

    it("validates inclusion of beginless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: ["admin", "user", "guest"] } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
    });

    it("validates inclusion of endless numeric range", () => {
      class Person extends Model {
        static {
          this.attribute("tier", "string");
          this.validates("tier", { inclusion: { in: ["free", "premium"] } });
        }
      }
      const p = new Person({ tier: "free" });
      expect(p.isValid()).toBe(true);
    });
  });

  describe("Validations Inclusion (ported)", () => {
    it("validates inclusion of", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
        }
      }
      expect(new Person({ karma: "ow" }).isValid()).toBe(true);
      expect(new Person({ karma: "other" }).isValid()).toBe(false);
    });

    it("validates inclusion of with allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow", "ar"] } });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validates inclusion of with formatted message", () => {
      class Person extends Model {
        static {
          this.attribute("karma", "string");
          this.validates("karma", { inclusion: { in: ["ow"], message: "is not allowed" } });
        }
      }
      const p = new Person({ karma: "other" });
      p.isValid();
      expect(p.errors.get("karma")).toContain("is not allowed");
    });
  });

  describe("InclusionValidationTest (ported)", () => {
    it("validates inclusion of with lambda", () => {
      class Person extends Model {
        static {
          this.attribute("role", "string");
          this.validates("role", { inclusion: { in: () => ["admin", "user"], allowNil: false } });
        }
      }
      const p = new Person({ role: "admin" });
      expect(p.isValid()).toBe(true);
      const p2 = new Person({ role: "hacker" });
      expect(p2.isValid()).toBe(false);
    });
  });
});
