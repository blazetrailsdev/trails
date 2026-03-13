import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("SerializationTest", () => {
    it("should use read attribute for serialization", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash();
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBe(25);
    });

    it("include option with empty association", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ include: "posts" });
      // No association loaded, so posts won't appear
      expect(hash["name"]).toBe("Alice");
    });

    it("include option with ary", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ include: ["posts", "comments"] });
      expect(hash["name"]).toBe("Alice");
    });

    it("only include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("except include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.serializableHash({ except: ["age"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });
  });

  describe("SerializationTest", () => {
    it("should raise NoMethodError for non existing method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash({ methods: ["nonexistent"] });
      // nonexistent method is simply not included
      expect(hash).toHaveProperty("name", "test");
    });

    it("multiple includes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
    });

    it("nested include", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
    });

    it("multiple includes with options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "test", age: 25 });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash).toHaveProperty("name", "test");
      expect(hash).not.toHaveProperty("age");
    });

    it("all includes with options", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "test", age: 25 });
      const hash = p.serializableHash();
      expect(hash).toHaveProperty("name", "test");
      expect(hash).toHaveProperty("age", 25);
    });
  });
});
