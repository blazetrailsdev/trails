import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, serialize } from "./index.js";
import { modelRegistry } from "./associations.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    contacts: {
      name: "string",
      age: "integer",
      avatar: "string",
      created_at: "string",
      awesome: "boolean",
      preferences: "string",
      alternative_id: "integer",
    },
    books: { format: "string", name: "string" },
    authors: { name: "string" },
    serialized_posts: { author_id: "integer", title: "string" },
  });
});

const contactAttributes = {
  name: "aaron stack",
  age: 25,
  avatar: "binarydata",
  created_at: "2006-08-01",
  awesome: false,
  preferences: '{"gem":"<strong>ruby</strong>"}',
  alternative_id: null as number | null,
};

describe("SerializationTest", () => {
  function makeContact() {
    class Contact extends Base {
      static {
        this._tableName = "contacts";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("avatar", "string");
        this.attribute("created_at", "string");
        this.attribute("awesome", "boolean");
        this.attribute("preferences", "string");
        this.attribute("alternative_id", "integer");
      }
    }
    return Contact;
  }

  it("include root in json is false by default", () => {
    expect((Base as any).includeRootInJson).toBe(false);
  });

  it("serialize should be reversible", () => {
    const Contact = makeContact();
    const serialized = new Contact().toJson();
    const contact = new Contact().fromJson(serialized);
    const keys = Object.keys(contactAttributes).map(String).sort();
    const attrs = Object.keys(contact.attributes).sort();
    expect(attrs).toEqual(expect.arrayContaining(keys));
  });

  it("serialize should allow attribute only filtering", () => {
    const Contact = makeContact();
    const serialized = new Contact(contactAttributes).toJson({ only: ["age", "name"] });
    const contact = new Contact().fromJson(serialized);
    expect(contact.name).toBe(contactAttributes.name);
    expect(contact.avatar).toBeNull();
  });

  it("serialize should allow attribute except filtering", () => {
    const Contact = makeContact();
    const serialized = new Contact(contactAttributes).toJson({ except: ["age", "name"] });
    const contact = new Contact().fromJson(serialized);
    expect(contact.name).toBeNull();
    expect(contact.age).toBeNull();
    expect(contact.awesome).toBe(contactAttributes.awesome);
  });

  it("include root in json allows inheritance", () => {
    const originalRootInJson = (Base as any).includeRootInJson;
    try {
      (Base as any).includeRootInJson = true;

      const klazz = class extends Base {
        static {
          this._tableName = "contacts";
        }
      };
      expect((klazz as any).includeRootInJson).toBe(true);

      (klazz as any).includeRootInJson = false;
      expect((Base as any).includeRootInJson).toBe(true);
      expect((klazz as any).includeRootInJson).toBe(false);
    } finally {
      (Base as any).includeRootInJson = originalRootInJson;
    }
  });

  it("read attribute for serialization with format without method missing", () => {
    class Book extends Base {
      static {
        this._tableName = "books";
        this.attribute("id", "integer");
        this.attribute("format", "string");
        this.attribute("name", "string");
      }
    }
    const book = new Book();
    expect(book.readAttribute("format")).toBeNull();
  });

  it("read attribute for serialization with format after init", () => {
    class Book extends Base {
      static {
        this._tableName = "books";
        this.attribute("id", "integer");
        this.attribute("format", "string");
        this.attribute("name", "string");
      }
    }
    const book = new Book({ format: "paperback" });
    expect(book.readAttribute("format")).toBe("paperback");
  });

  it("read attribute for serialization with format after find", async () => {
    class Book extends Base {
      static {
        this._tableName = "books";
        this.attribute("id", "integer");
        this.attribute("format", "string");
        this.attribute("name", "string");
      }
    }
    const created = await Book.create({ format: "paperback" });
    const book = await Book.find(created.id);
    expect(book.readAttribute("format")).toBe("paperback");
  });

  it("find records by serialized attributes through join", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.hasMany("serializedPosts", { className: "SerializedPost", foreignKey: "author_id" });
      }
    }

    class SerializedPost extends Base {
      static {
        this._tableName = "serialized_posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.belongsTo("author", { className: "Author" });
        serialize(this, "title");
      }
    }

    registerModel("Author", Author);
    registerModel("SerializedPost", SerializedPost);

    try {
      const author = await Author.create({ name: "David" });
      await SerializedPost.create({ author_id: author.id, title: "Hello" });

      const results = await Author.joins("serializedPosts")
        .where({ name: "David", serialized_posts: { title: "Hello" } })
        .toArray();
      expect(results.length).toBe(1);
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("SerializedPost");
    }
  });

  it("excludes the inheritance column from serializable_hash for STI models", () => {
    class Vehicle extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.inheritanceColumn = "type";
      }
    }

    const car = new Vehicle({ id: 1, name: "Camry", type: "Car" });
    const hash = car.serializableHash();
    expect(hash).toMatchObject({ id: 1, name: "Camry" });
    expect(hash).not.toHaveProperty("type");
  });

  it("respects an overridden attributeNamesForSerialization", () => {
    class SecretModel extends Base {
      attributeNamesForSerialization() {
        return ["name"];
      }
    }
    SecretModel._tableName = "secrets";
    SecretModel.attribute("id", "integer");
    SecretModel.attribute("name", "string");
    SecretModel.attribute("ssn", "string");

    const s = new SecretModel({ id: 1, name: "Visible", ssn: "111-22-3333" });
    const hash = s.serializableHash();
    expect(hash).toMatchObject({ name: "Visible" });
    expect(hash).not.toHaveProperty("ssn");
    expect(hash).not.toHaveProperty("id");
  });

  it("does not duplicate the inheritance column when caller already passes it in except", () => {
    class Vehicle extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.inheritanceColumn = "type";
      }
    }

    const car = new Vehicle({ id: 1, name: "Camry", type: "Car" });
    const hash = car.serializableHash({ except: ["type"] });
    expect(hash).not.toHaveProperty("type");
    expect(hash).toMatchObject({ id: 1, name: "Camry" });
  });
});

describe("toXml() on Base", () => {
  it("serializes a record to XML", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    const xml = u.toXml();
    expect(xml).toContain("<user>");
    expect(xml).toContain("<name>Alice</name>");
    expect(xml).toContain("</user>");
  });
});

describe("serializableHash with include", () => {
  it("includes nested associations when preloaded", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const author = await Author.create({ name: "Alice" });
    const fakePost = {
      _attributes: new Map<string, string | number>([
        ["title", "Hello"],
        ["id", 1],
      ]),
    };
    (author as any)._preloadedAssociations = new Map([["posts", [fakePost]]]);

    const { serializableHash } = await import("@blazetrails/activemodel");
    const hash = serializableHash(author, { include: ["posts"] });
    expect(hash.name).toBe("Alice");
    expect(Array.isArray(hash.posts)).toBe(true);
    expect((hash.posts as any[])[0].title).toBe("Hello");
  });
});

describe("fromJson on Base", () => {
  it("sets attributes from JSON", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const u = new User({});
    u.fromJson('{"name":"Alice"}');
    expect(u.name).toBe("Alice");
  });

  it("supports includeRoot", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const u = new User({});
    u.fromJson('{"user":{"name":"Bob"}}', true);
    expect(u.name).toBe("Bob");
  });
});
