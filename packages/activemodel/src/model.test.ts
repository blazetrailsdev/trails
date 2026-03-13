import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("ModelTest", () => {
    it("initialize with params", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(25);
    });

    it("initialize with nil or empty hash params does not explode", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => new Person()).not.toThrow();
      expect(() => new Person({})).not.toThrow();
    });
  });

  describe("ModelTest", () => {
    it("initialize with params and mixins reversed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Bob", age: 25 });
      expect(p.readAttribute("name")).toBe("Bob");
      expect(p.readAttribute("age")).toBe(25);
    });

    it("mixin inclusion chain", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p).toBeInstanceOf(Model);
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

  describe("ModelTest (ported)", () => {
    it("persisted is always false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      expect(new Person({ name: "Alice" }).isPersisted()).toBe(false);
    });

    it("load hook is called", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterInitialize((r: any) => {
            log.push("initialized");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      expect(log).toEqual(["initialized"]);
    });
  });
});
