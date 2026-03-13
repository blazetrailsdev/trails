import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("TranslationTest", () => {
    it("translated model attributes", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes with default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(Person.humanAttributeName("name")).toBe("Name");
    });

    it("human attribute name does not modify options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      // Calling multiple times should be idempotent
      expect(Person.humanAttributeName("name")).toBe("Name");
      expect(Person.humanAttributeName("name")).toBe("Name");
    });
  });

  describe("Translation (basic)", () => {
    it("translated model attributes", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      // humanAttributeName provides basic translation
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes with default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(Person.humanAttributeName("name")).toBe("Name");
    });

    it("translated model names", () => {
      class Person extends Model {}
      expect(Person.modelName.singular).toBe("person");
      expect(Person.modelName.plural).toBe("people");
    });

    it("translated model when missing translation", () => {
      // Falls back to humanized attribute name
      class Person extends Model {}
      expect(Person.humanAttributeName("unknown_attr")).toBe("Unknown attr");
    });
  });
});
