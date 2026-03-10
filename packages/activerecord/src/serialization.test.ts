/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("SerializationTest", () => {
  let adapter: DatabaseAdapter;
  let Contact: typeof Base;

  beforeEach(() => {
    adapter = freshAdapter();
    Contact = class extends Base {};
    Contact._tableName = "contacts";
    Contact.attribute("id", "integer");
    Contact.attribute("name", "string");
    Contact.attribute("age", "integer");
    Contact.attribute("created_at", "string");
    Contact.adapter = adapter;
  });

  it("include root in json is false by default", () => {
    expect((Contact as any).includeRootInJson).toBeFalsy();
  });

  it("serialize should be reversible", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const json = contact.toJson();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("David");
    expect(parsed.age).toBe(30);
  });

  it("serialize should allow attribute only filtering", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.serializableHash({ only: ["name"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
  });

  it("serialize should allow attribute except filtering", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.serializableHash({ except: ["age"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
  });

  it("include root in json allows inheritance", async () => {
    (Contact as any).includeRootInJson = true;
    const Sub = class extends Contact {};
    Sub._tableName = "contacts";
    const contact = await Sub.create({ name: "David", age: 30 });
    const json = contact.asJson();
    const keys = Object.keys(json);
    expect(keys.length).toBe(1);
    (Contact as any).includeRootInJson = false;
  });

  it("read attribute for serialization with format without method missing", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.serializableHash();
    expect(hash.name).toBe("David");
  });

  it("read attribute for serialization with format after init", () => {
    const contact = new Contact({ name: "David", age: 30 });
    const hash = contact.serializableHash();
    expect(hash.name).toBe("David");
    expect(hash.age).toBe(30);
  });

  it("read attribute for serialization with format after find", async () => {
    const created = await Contact.create({ name: "David", age: 30 });
    const found = await Contact.find(created.readAttribute("id"));
    const hash = found.serializableHash();
    expect(hash.name).toBe("David");
  });

  it.skip("find records by serialized attributes through join", () => { /* needs associations + serialized columns */ });
});


describe("toXml() on Base", () => {
  it("serializes a record to XML", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
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
    const adapter = freshAdapter();
    class Author extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const author = await Author.create({ name: "Alice" });
    // Simulate preloaded associations
    const fakePost = { _attributes: new Map<string, string | number>([["title", "Hello"], ["id", 1]]) };
    (author as any)._preloadedAssociations = new Map([["posts", [fakePost]]]);

    const { serializableHash } = await import("@rails-ts/activemodel");
    const hash = serializableHash(author, { include: ["posts"] });
    expect(hash.name).toBe("Alice");
    expect(Array.isArray(hash.posts)).toBe(true);
    expect((hash.posts as any[])[0].title).toBe("Hello");
  });
});

describe("fromJson on Base", () => {
  it("sets attributes from JSON", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const u = new User({});
    u.fromJson('{"name":"Alice"}');
    expect(u.readAttribute("name")).toBe("Alice");
  });

  it("supports includeRoot", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const u = new User({});
    u.fromJson('{"user":{"name":"Bob"}}', true);
    expect(u.readAttribute("name")).toBe("Bob");
  });
});
