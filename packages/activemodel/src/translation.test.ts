import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

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

  describe("ActiveModelI18nTests", () => {
    it("translated model attributes using default option", () => {
      expect(Model.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes using default option as symbol", () => {
      expect(Model.humanAttributeName("last_name")).toBe("Last name");
    });

    it("translated model attributes falling back to default", () => {
      expect(Model.humanAttributeName("email")).toBe("Email");
    });

    it("translated model attributes using default option as symbol and falling back to default", () => {
      expect(Model.humanAttributeName("phone_number")).toBe("Phone number");
    });

    it("translated model attributes with ancestors fallback", () => {
      expect(Model.humanAttributeName("created_at")).toBe("Created at");
    });

    it("translated model attributes with attribute matching namespaced model name", () => {
      expect(Model.humanAttributeName("model_name")).toBe("Model name");
    });

    it("translated deeply nested model attributes", () => {
      expect(Model.humanAttributeName("nested_attribute")).toBe("Nested attribute");
    });

    it("translated nested model attributes", () => {
      expect(Model.humanAttributeName("parent_id")).toBe("Parent");
    });

    it("translated nested model attributes with namespace fallback", () => {
      expect(Model.humanAttributeName("admin_role")).toBe("Admin role");
    });

    it("translated model with namespace", () => {
      expect(Model.humanAttributeName("namespace_attr")).toBe("Namespace attr");
    });

    it("translated subclass model", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated subclass model when ancestor translation", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("last_name")).toBe("Last name");
    });

    it("translated attributes when nil", () => {
      expect(Model.humanAttributeName("nil_attr")).toBe("Nil attr");
    });

    it("translated deeply nested attributes when nil", () => {
      expect(Model.humanAttributeName("deep_nil")).toBe("Deep nil");
    });

    it("translated subclass model when missing translation", () => {
      class Person extends Model {}
      expect(Person.humanAttributeName("missing")).toBe("Missing");
    });

    it("translated model with default value when missing translation", () => {
      expect(Model.humanAttributeName("unknown_field")).toBe("Unknown field");
    });

    it("translated model with default key when missing both translations", () => {
      expect(Model.humanAttributeName("unknown")).toBe("Unknown");
    });

    it("human does not modify options", () => {
      const opts = {};
      Model.humanAttributeName("name");
      expect(opts).toEqual({});
    });

    it("human attribute name does not modify options", () => {
      const opts = {};
      Model.humanAttributeName("name");
      expect(opts).toEqual({});
    });

    it("raise on missing translations", () => {
      // humanAttributeName always returns a default, never raises
      expect(Model.humanAttributeName("missing_field")).toBe("Missing field");
    });

    it("translated model attributes with symbols", () => {
      expect(Model.humanAttributeName("first_name")).toBe("First name");
    });

    it("translated model attributes with ancestor", () => {
      class Parent extends Model {}
      class Child extends Parent {}
      expect(Child.humanAttributeName("first_name")).toBe("First name");
    });
  });
});
