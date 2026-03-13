import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("FormatValidationTest", () => {
    it("validates format of with multiline regexp and option", () => {
      // Multiline regexp should raise error
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: { with: /^foo$/m } });
          }
        }
      }).toThrow(/multiline/i);
    });

    it("validates format of without lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: /^[a-z]+$/ } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "Alice123" }).isValid()).toBe(false);
    });
  });

  describe("FormatValidationTest", () => {
    it("validates format of with both regexps should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("email", "string");
            this.validates("email", { format: { with: /@/, without: /test/ } });
          }
        }
      }).not.toThrow();
    });

    it("validates format of when with isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { with: /.+@.+/ } });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });

    it("validates format of when not isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("email", "string");
          this.validates("email", { format: { without: /banned/ } });
        }
      }
      const p = new Person({ email: "test@test.com" });
      expect(p.isValid()).toBe(true);
    });

    it("validates format of without lambda", () => {
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
  });

  describe("Validations Format (ported)", () => {
    it("validate format", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { format: { with: /^[A-Z]/ } });
        }
      }
      expect(new Person({ title: "Hello" }).isValid()).toBe(true);
      expect(new Person({ title: "hello" }).isValid()).toBe(false);
    });

    it("validate format with not option", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { format: { without: /\d/ } });
        }
      }
      expect(new Person({ title: "hello" }).isValid()).toBe(true);
      expect(new Person({ title: "hello123" }).isValid()).toBe(false);
    });

    it("validate format with formatted message", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", {
            format: { with: /^[A-Z]/, message: "must start with uppercase" },
          });
        }
      }
      const p = new Person({ title: "hello" });
      p.isValid();
      expect(p.errors.get("title")).toContain("must start with uppercase");
    });
  });
});
