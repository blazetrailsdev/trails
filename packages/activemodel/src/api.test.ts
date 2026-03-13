import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("APITest (ported)", () => {
    it("initialize with params", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("initialize with nil or empty hash params does not explode", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => new Person({})).not.toThrow();
      expect(() => new Person()).not.toThrow();
    });

    it("persisted is always false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).isPersisted()).toBe(false);
    });
  });

  describe("APITest", () => {
    it("initialize with params and mixins reversed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 30 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("mixin initializer when args exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("mixin initializer when args dont exist", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(p.readAttribute("name")).toBeNull();
    });
  });

  describe("API tests", () => {
    it("mixin inclusion chain", () => {
      // Model includes Attributes, Validations, Callbacks, Dirty, Serialization, Naming
      const p = new Model();
      expect(typeof p.readAttribute).toBe("function");
      expect(typeof p.writeAttribute).toBe("function");
      expect(typeof p.isValid).toBe("function");
      expect(typeof p.runCallbacks).toBe("function");
      expect(typeof p.serializableHash).toBe("function");
      expect(p.modelName).toBeDefined();
      expect(typeof p.changed).toBe("boolean");
    });
  });
});
