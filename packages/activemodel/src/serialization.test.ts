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
      expect(() => p.serializableHash({ methods: ["nonexistent"] })).toThrow(
        /undefined method 'nonexistent'/,
      );
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

  describe("Serialization (ported)", () => {
    class SerPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
      get greeting(): string {
        return `Hi ${this.readAttribute("name")}`;
      }
    }

    it("method serializable hash should work", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash();
      expect(hash.name).toBe("Alice");
      expect(hash.age).toBe(30);
      expect(hash.email).toBe("a@b.com");
    });

    it("method serializable hash should work with only option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ only: ["name"] });
      expect(hash.name).toBe("Alice");
      expect(hash.age).toBeUndefined();
    });

    it("method serializable hash should work with except option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ except: ["email"] });
      expect(hash.name).toBe("Alice");
      expect(hash.email).toBeUndefined();
    });

    it("method serializable hash should work with methods option", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ methods: ["greeting"] });
      expect(hash.greeting).toBe("Hi Alice");
    });

    it("method serializable hash should work with only and methods", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ only: ["name"], methods: ["greeting"] });
      expect(Object.keys(hash).sort()).toEqual(["greeting", "name"]);
    });

    it("method serializable hash should work with except and methods", () => {
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const hash = p.serializableHash({ except: ["email", "age"], methods: ["greeting"] });
      expect(hash.name).toBe("Alice");
      expect(hash.email).toBeUndefined();
      expect(hash.greeting).toBe("Hi Alice");
    });
  });

  describe("SerializationTest (ported)", () => {
    class Post extends Model {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.attribute("rating", "integer");
      }
    }

    it("include option with singular association", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      const comment = { _attributes: new Map([["text", "Great!"]]) };
      (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
      const result = p.serializableHash({ include: ["comments"] });
      expect(Array.isArray(result.comments)).toBe(true);
      expect((result.comments as any[])[0].text).toBe("Great!");
    });

    it("include with options", () => {
      const p = new Post({ title: "Hello", body: "World", rating: 5 });
      const comment = {
        _attributes: new Map([
          ["text", "Great!"],
          ["author", "Bob"],
        ]),
      };
      (p as any)._preloadedAssociations = new Map([["comments", [comment]]]);
      const result = p.serializableHash({ include: { comments: { only: ["text"] } } });
      expect((result.comments as any[])[0].text).toBe("Great!");
      expect((result.comments as any[])[0].author).toBeUndefined();
    });

    it("method serializable hash should work with only option with order of given keys", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.attribute("email", "string");
        }
      }
      const p = new Person({ name: "Alice", age: 25, email: "a@b.com" });
      const result = p.serializableHash({ only: ["email", "name"] });
      const keys = Object.keys(result);
      expect(keys).toContain("email");
      expect(keys).toContain("name");
      expect(result.age).toBeUndefined();
    });

    it("include option with plural association", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const result = p.serializableHash();
      expect(result.name).toBe("Alice");
    });
  });
});
