import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("JsonSerializationTest", () => {
    it("should include root in JSON (option) even if the default is set to false", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = true;
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json["person"]).toBeDefined();
      expect(json["person"]["name"]).toBe("Alice");
      Person.includeRootInJson = false;
    });

    it("should include custom root in JSON", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = "human";
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJson());
      expect(json["human"]).toBeDefined();
      expect(json["human"]["name"]).toBe("Alice");
      Person.includeRootInJson = false;
    });

    it("methods are called on object", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        greeting() {
          return `Hello ${this.readAttribute("name")}`;
        }
      }
      const p = new Person({ name: "Alice" });
      const hash = p.serializableHash({ methods: ["greeting"] });
      expect(hash["greeting"]).toBe("Hello Alice");
    });

    it("from_json should work without a root (method parameter)", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person();
      p.fromJson('{"name":"Bob","age":30}');
      expect(p.readAttribute("name")).toBe("Bob");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("as_json should work with root option set to string", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = "custom_root";
      const p = new Person({ name: "Alice" });
      const json = p.asJson();
      expect(json["custom_root"]).toBeDefined();
      Person.includeRootInJson = false;
    });

    it("as_json should work with include option paired with only filter", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.asJson({ only: ["name"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("as_json should work with include option paired with except filter", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      const hash = p.asJson({ except: ["age"] });
      expect(hash["name"]).toBe("Alice");
      expect(hash["age"]).toBeUndefined();
    });

    it("Class.model_name should be JSON encodable", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const mn = Person.modelName;
      expect(JSON.stringify(mn)).toBeDefined();
    });
  });

  describe("JsonSerializationTest", () => {
    it("should return Hash for errors", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
        }
      }
      const p = new Person({});
      p.isValid();
      const errJson = p.errors.asJson();
      expect(errJson).toHaveProperty("name");
    });

    it("custom as_json should be honored when generating json", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        asJson() {
          return { custom: true };
        }
      }
      const p = new Person({ name: "test" });
      expect(p.asJson()).toEqual({ custom: true });
    });

    it("custom as_json options should be extensible", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      const json = p.asJson({ only: ["name"] });
      expect(json).toHaveProperty("name", "test");
    });
  });
});
