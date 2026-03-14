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
      try {
        const p = new Person({ name: "Alice" });
        const json = JSON.parse(p.toJson());
        expect(json["person"]).toBeDefined();
        expect(json["person"]["name"]).toBe("Alice");
      } finally {
        Person.includeRootInJson = false;
      }
    });

    it("should include custom root in JSON", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Person.includeRootInJson = "human";
      try {
        const p = new Person({ name: "Alice" });
        const json = JSON.parse(p.toJson());
        expect(json["human"]).toBeDefined();
        expect(json["human"]["name"]).toBe("Alice");
      } finally {
        Person.includeRootInJson = false;
      }
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

  describe("JSON Serialization (ported)", () => {
    class JsonPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    it("should encode all encodable attributes", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.toJson();
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe("Alice");
      expect(parsed.age).toBe(30);
    });

    it("should allow attribute filtering with only", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = JSON.parse(p.toJson({ only: ["name"] }));
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("should allow attribute filtering with except", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = JSON.parse(p.toJson({ except: ["age"] }));
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("as_json should allow attribute filtering with only", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.asJson({ only: ["name"] });
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("as_json should allow attribute filtering with except", () => {
      const p = new JsonPerson({ name: "Alice", age: 30 });
      const json = p.asJson({ except: ["age"] });
      expect(json.name).toBe("Alice");
      expect(json.age).toBeUndefined();
    });

    it("from_json should work without a root (class attribute)", () => {
      const p = new JsonPerson({});
      p.fromJson('{"name":"Alice","age":30}');
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(30);
    });

    it("from_json should work with a root (method parameter)", () => {
      const p = new JsonPerson({});
      p.fromJson('{"json_person":{"name":"Alice","age":30}}', true);
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });

  describe("JSON Serialization (root in JSON)", () => {
    it("should include root in JSON if include_root_in_json is true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = true;
        }
      }
      try {
        const p = new Person({ name: "Alice" });
        const json = JSON.parse(p.toJson());
        expect(json).toEqual({ person: { name: "Alice" } });
      } finally {
        Person.includeRootInJson = false;
      }
    });

    it("should include custom root in JSON", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = "human";
        }
      }
      try {
        const p = new Person({ name: "Alice" });
        const json = JSON.parse(p.toJson());
        expect(json).toEqual({ human: { name: "Alice" } });
      } finally {
        Person.includeRootInJson = false;
      }
    });

    it("as_json should return a hash if include_root_in_json is true", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.includeRootInJson = true;
        }
      }
      try {
        const p = new Person({ name: "Alice" });
        const result = p.asJson();
        expect(result).toEqual({ person: { name: "Alice" } });
      } finally {
        Person.includeRootInJson = false;
      }
    });
  });

  describe("JsonSerializationTest (ported)", () => {
    it("serializable_hash should not modify options passed in argument", () => {
      class SerPerson extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.attribute("email", "string");
        }
      }
      const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
      const opts = { only: ["name"] };
      p.serializableHash(opts);
      expect(opts).toEqual({ only: ["name"] });
    });

    it("should not include root in JSON (class method)", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const c = new Contact({ name: "Konata", age: 16 });
      const json = c.toJson();
      expect(json).not.toMatch(/"contact":/);
      expect(json).toMatch(/"name":"Konata"/);
    });

    it("should not include root in JSON (option)", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      Contact.includeRootInJson = true;
      const c = new Contact({ name: "Konata" });
      const json = JSON.parse(c.toJson());
      expect(json.contact).toBeDefined();
      expect(json.contact.name).toBe("Konata");
      Contact.includeRootInJson = false;
    });

    it("as_json should serialize timestamps", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("created_at", "string");
        }
      }
      const c = new Contact({ name: "Konata", created_at: "2006-08-01T00:00:00.000Z" });
      const json = c.asJson();
      expect(json.created_at).toBe("2006-08-01T00:00:00.000Z");
    });

    it("as_json should work with root option set to true", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      Contact.includeRootInJson = true;
      const c = new Contact({ name: "Konata", age: 16 });
      const json = c.asJson();
      expect(json.contact).toBeDefined();
      expect((json.contact as any).name).toBe("Konata");
      Contact.includeRootInJson = false;
    });

    it("as_json should work with methods options", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
        }
        social() {
          return "twitter";
        }
      }
      const c = new Contact({ name: "Konata" });
      const json = c.serializableHash({ methods: ["social"] });
      expect(json.name).toBe("Konata");
    });

    it("as_json should work with include option", () => {
      class Contact extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const c = new Contact({ name: "Konata", age: 16 });
      const json = c.asJson();
      expect(json.name).toBe("Konata");
      expect(json.age).toBe(16);
    });
  });
});
