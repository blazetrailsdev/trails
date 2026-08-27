/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Serializers::JSON` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { JSON as SerializersJSON } from "./json.js";
import { Model } from "../index.js";

describe("JsonSerializationTest", () => {
  it("should include root in JSON (option) even if the default is set to false", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice" });
    const json = JSON.parse(p.toJSON({ root: true }));
    expect(json["person"]).toBeDefined();
    expect(json["person"]["name"]).toBe("Alice");
  });

  it("should include custom root in JSON", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice" });
    const json = JSON.parse(p.toJSON({ root: "human" }));
    expect(json["human"]).toBeDefined();
    expect(json["human"]["name"]).toBe("Alice");
  });

  it("methods are called on object", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
      greeting() {
        return `Hello ${this._readAttribute("name")}`;
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice" });
    const hash = p.serializableHash({ methods: ["greeting"] });
    expect(hash["greeting"]).toBe("Hello Alice");
  });

  it("from_json should work without a root (method parameter)", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person();
    p.fromJson('{"name":"Bob","age":30}');
    expect(p._readAttribute("name")).toBe("Bob");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("as_json should work with root option set to string", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice" });
    const json = p.asJson({ root: "custom_root" });
    expect(json["custom_root"]).toBeDefined();
  });

  it("as_json should work with include option paired with only filter", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.asJson({ only: ["name"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("as_json should work with include option paired with except filter", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "Alice", age: 25 });
    const hash = p.asJson({ except: ["age"] });
    expect(hash["name"]).toBe("Alice");
    expect(hash["age"]).toBeUndefined();
  });

  it("Class.model_name should be JSON encodable", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Person extends SerializersJSON {}

    const mn = Person.modelName;
    expect(JSON.stringify(mn)).toBeDefined();
  });

  it("should return Hash for errors", async () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({});
    await p.isValid();
    const errJson = p.errors.asJson();
    expect(errJson).toHaveProperty("name");
  });

  it("custom as_json should be honored when generating json", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
      asJson() {
        return { custom: true };
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "test" });
    expect(p.asJson()).toEqual({ custom: true });
  });

  it("custom as_json options should be extensible", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Person extends SerializersJSON {}

    const p = new Person({ name: "test" });
    const json = p.asJson({ only: ["name"] });
    expect(json).toHaveProperty("name", "test");
  });

  class JsonPerson extends Model {
    static {
      include(this, SerializersJSON);
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  interface JsonPerson extends SerializersJSON {}

  it("should encode all encodable attributes", () => {
    const p = new JsonPerson({ name: "Alice", age: 30 });
    const json = p.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Alice");
    expect(parsed.age).toBe(30);
  });

  it("should allow attribute filtering with only", () => {
    const p = new JsonPerson({ name: "Alice", age: 30 });
    const json = JSON.parse(p.toJSON({ only: ["name"] }));
    expect(json.name).toBe("Alice");
    expect(json.age).toBeUndefined();
  });

  it("should allow attribute filtering with except", () => {
    const p = new JsonPerson({ name: "Alice", age: 30 });
    const json = JSON.parse(p.toJSON({ except: ["age"] }));
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
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("from_json should work with a root (method parameter)", () => {
    const p = new JsonPerson({});
    p.fromJson('{"json_person":{"name":"Alice","age":30}}', true);
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("should include root in JSON if include_root_in_json is true", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface Person extends SerializersJSON {}

    try {
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJSON());
      expect(json).toEqual({ person: { name: "Alice" } });
    } finally {
      Person.includeRootInJson = false;
    }
  });

  it("should include custom root in JSON", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = "human";
      }
    }
    interface Person extends SerializersJSON {}

    try {
      const p = new Person({ name: "Alice" });
      const json = JSON.parse(p.toJSON());
      expect(json).toEqual({ human: { name: "Alice" } });
    } finally {
      Person.includeRootInJson = false;
    }
  });

  it("as_json should return a hash if include_root_in_json is true", () => {
    class Person extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface Person extends SerializersJSON {}

    try {
      const p = new Person({ name: "Alice" });
      const result = p.asJson();
      expect(result).toEqual({ person: { name: "Alice" } });
    } finally {
      Person.includeRootInJson = false;
    }
  });

  it("serializable_hash should not modify options passed in argument", () => {
    class SerPerson extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
    }
    interface SerPerson extends SerializersJSON {}

    const p = new SerPerson({ name: "Alice", age: 30, email: "a@b.com" });
    const opts = { only: ["name"] };
    p.serializableHash(opts);
    expect(opts).toEqual({ only: ["name"] });
  });

  it("should not include root in JSON (class method)", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata", age: 16 });
    const json = c.toJSON();
    expect(json).not.toMatch(/"contact":/);
    expect(json).toMatch(/"name":"Konata"/);
  });

  it("should not include root in JSON (option)", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata" });
    const json = c.toJSON({ root: false });
    expect(json).not.toMatch(/"contact":/);
    expect(json).toMatch(/"name":"Konata"/);
  });

  it("as_json should serialize timestamps", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("created_at", "string");
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata", created_at: "2006-08-01T00:00:00.000Z" });
    const json = c.asJson();
    expect(json.created_at).toBe("2006-08-01T00:00:00.000Z");
  });

  it("as_json should work with root option set to true", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata", age: 16 });
    const json = c.asJson({ root: true });
    expect(json.contact).toBeDefined();
    expect((json.contact as any).name).toBe("Konata");
  });

  it("as_json should work with methods options", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
      social() {
        return "twitter";
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata" });
    const json = c.serializableHash({ methods: ["social"] });
    expect(json.name).toBe("Konata");
  });

  it("as_json should work with include option", () => {
    class Contact extends Model {
      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Contact extends SerializersJSON {}

    const c = new Contact({ name: "Konata", age: 16 });
    const json = c.asJson();
    expect(json.name).toBe("Konata");
    expect(json.age).toBe(16);
  });

  it("from_json unwraps via first-value semantics on multi-key wrappers (Rails hash.values.first)", () => {
    class Multi extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = "person";
      }
    }
    interface Multi extends SerializersJSON {}

    try {
      const m = new Multi({}).fromJson('{"first":{"name":"Carol"},"person":{"name":"Dan"}}');
      expect(m._readAttribute("name")).toBe("Carol");
    } finally {
      Multi.includeRootInJson = false;
    }
  });

  it("from_json rejects non-object JSON with shape-accurate diagnostics", () => {
    class P extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface P extends SerializersJSON {}

    expect(() => new P({}).fromJson("42")).toThrow(/Number passed/);
    expect(() => new P({}).fromJson("[1,2]")).toThrow(/Array passed/);
    expect(() => new P({}).fromJson("null")).toThrow(/NilClass passed/);
  });

  it("from_json rejects non-object root payload after unwrap", () => {
    class P extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface P extends SerializersJSON {}

    try {
      expect(() => new P({}).fromJson('{"p":42}')).toThrow(/Number passed/);
    } finally {
      P.includeRootInJson = false;
    }
  });

  it("from_json defaults includeRoot to includeRootInJson when no second arg passed", () => {
    class Wrapped extends Model {
      declare static includeRootInJson: boolean | string;

      static {
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface Wrapped extends SerializersJSON {}

    try {
      const w = new Wrapped({}).fromJson('{"wrapped":{"name":"Alice"}}');
      expect(w._readAttribute("name")).toBe("Alice");
    } finally {
      Wrapped.includeRootInJson = false;
    }
  });
});
