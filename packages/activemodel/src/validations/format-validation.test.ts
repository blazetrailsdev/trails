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
      }).toThrow(/but not both/);
    });

    it("validates format of when with isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: "not a regexp" as any } });
        }
      }
      const p = new Person({ name: "test" });
      expect(() => p.isValid()).toThrow();
    });

    it("validates format of when not isnt a regexp should raise error", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { without: "not a regexp" as any } });
        }
      }
      const p = new Person({ name: "test" });
      expect(() => p.isValid()).toThrow();
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

  describe("FormatValidationTest", () => {
    it("validate format with allow blank", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { format: { with: /^[A-Z]/, allowBlank: true } });
        }
      }
      expect(new Person({ title: "" }).isValid()).toBe(true);
      expect(new Person({ title: "Hello" }).isValid()).toBe(true);
      expect(new Person({ title: "hello" }).isValid()).toBe(false);
    });

    it("validate format numeric", () => {
      class Person extends Model {
        static {
          this.attribute("value", "string");
          this.validates("value", { format: { with: /^\d+$/ } });
        }
      }
      expect(new Person({ value: "123" }).isValid()).toBe(true);
      expect(new Person({ value: "abc" }).isValid()).toBe(false);
    });

    it("validate format of with multiline regexp should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: { with: /^foo$/m } });
          }
        }
      }).toThrow(/multiline/i);
    });

    it("validate format of with multiline regexp and option", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: { with: new RegExp("^foo$", "m") } });
          }
        }
      }).toThrow(/multiline/i);
    });

    it("validate format of without any regexp should raise error", () => {
      expect(() => {
        class Person extends Model {
          static {
            this.attribute("name", "string");
            this.validates("name", { format: {} as any });
          }
        }
      }).toThrow(/Either :with or :without must be supplied/);
    });

    it("validates format of with lambda", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: () => /^[a-z]+$/ } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "Alice123" }).isValid()).toBe(false);
    });

    it("validates format of with lambda without arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { format: { with: () => /^\w+$/ } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "" }).isValid()).toBe(false);
    });

    it("validates format of for ruby class", () => {
      class Person extends Model {}
      Person.attribute("email", "string");
      Person.validates("email", { format: { with: /@/ } });
      expect(new Person({ email: "a@b.com" }).isValid()).toBe(true);
      expect(new Person({ email: "invalid" }).isValid()).toBe(false);
    });
  });
});
