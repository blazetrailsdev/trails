import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ActiveModel", () => {
  describe("ConditionalValidationTest", () => {
    it("if validation using block true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
    });

    it("if validation using block false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => false });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("unless validation using block true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, unless: () => true });
        }
      }
      expect(new Person({}).isValid()).toBe(true);
    });

    it("unless validation using block false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, unless: () => false });
        }
      }
      expect(new Person({}).isValid()).toBe(false);
    });

    it("validation using combining if true and unless true conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true, unless: () => true });
        }
      }
      // unless returns true, so validation is skipped
      expect(new Person({}).isValid()).toBe(true);
    });

    it("validation using combining if true and unless false conditions", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true, if: () => true, unless: () => false });
        }
      }
      // both conditions met, validation runs
      expect(new Person({}).isValid()).toBe(false);
    });
  });
});
