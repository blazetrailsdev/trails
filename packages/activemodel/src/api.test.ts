import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
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
});
