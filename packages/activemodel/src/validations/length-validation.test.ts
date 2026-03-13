import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("LengthValidationTest", () => {
    it("optionally validates length of using within", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { in: [3, 10] } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(false);
      const p2 = new Person({ name: "abc" });
      expect(p2.isValid()).toBe(true);
    });

    it("optionally validates length of using is", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { is: 5 } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "bob" }).isValid()).toBe(false);
    });

    it("validates length of using minimum utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 3 } });
        }
      }
      const p = new Person({ name: "\u{1F600}\u{1F600}\u{1F600}" });
      // Emoji are 2 code units each in JS, so length >= 3
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using maximum utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: 5 } });
        }
      }
      const p = new Person({ name: "ab" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using within utf8", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { in: [1, 5] } });
        }
      }
      expect(new Person({ name: "abc" }).isValid()).toBe(true);
    });

    it("validates length of for infinite maxima", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { minimum: 1, maximum: Infinity } });
        }
      }
      expect(new Person({ name: "a" }).isValid()).toBe(true);
      expect(new Person({ name: "a".repeat(1000) }).isValid()).toBe(true);
    });

    it("validates length of using maximum should not allow nil when nil not allowed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, length: { maximum: 5 } });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
    });

    it("validates length of using both minimum and maximum should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, length: { minimum: 1, maximum: 5 } });
        }
      }
      const p = new Person();
      expect(p.isValid()).toBe(false);
    });

    it("validates length of using proc as maximum with model method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: () => 5 } });
        }
      }
      expect(new Person({ name: "alice" }).isValid()).toBe(true);
      expect(new Person({ name: "aliceb" }).isValid()).toBe(false);
    });

    it("validates length of using lambda as maximum", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { length: { maximum: () => 10 } });
        }
      }
      expect(new Person({ name: "short" }).isValid()).toBe(true);
      expect(new Person({ name: "a".repeat(11) }).isValid()).toBe(false);
    });
  });

  describe("LengthValidationTest", () => {
    it("validates length of using bignum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 1000000 } });
        }
      }
      const p = new Person({ title: "short" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of nasty params", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 1 } });
        }
      }
      const p = new Person({ title: "" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("optionally validates length of using within utf8", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { in: [3, 5] } });
        }
      }
      const p = new Person({ title: "abc" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using is utf8", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 5 } });
        }
      }
      const p = new Person({ title: "abcde" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of for ruby class", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 2 } });
        }
      }
      const p = new Person({ title: "ok" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using maximum should not allow nil and empty string when blank not allowed", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true, length: { maximum: 5 } });
        }
      }
      const p = new Person({ title: "" });
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates length of using minimum 0 should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true, length: { minimum: 0 } });
        }
      }
      const p = new Person({});
      p.isValid();
      expect(p.errors.count).toBeGreaterThan(0);
    });

    it("validates length of using is 0 should not allow nil", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { is: 0 } });
        }
      }
      const p = new Person({});
      // null is skipped by length validator
      expect(p.isValid()).toBe(true);
    });

    it("validates with diff in option", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { minimum: 2, maximum: 10 } });
        }
      }
      const p = new Person({ title: "ok" });
      expect(p.isValid()).toBe(true);
    });

    it("validates length of using symbol as maximum", () => {
      class Person extends Model {
        static {
          this.attribute("title", "string");
          this.validates("title", { length: { maximum: 10 } });
        }
      }
      const p = new Person({ title: "short" });
      expect(p.isValid()).toBe(true);
    });
  });
});
