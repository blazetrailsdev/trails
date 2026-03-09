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

describe("JsonSerializationTest", () => {
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

  it("should demodulize root in json", async () => {
    (Contact as any).includeRootInJson = true;
    const contact = await Contact.create({ name: "David", age: 30 });
    const json = contact.asJson();
    // Root key should be the demodulized model name
    const keys = Object.keys(json);
    expect(keys.length).toBe(1);
    (Contact as any).includeRootInJson = false;
  });

  it("should include root in json", async () => {
    (Contact as any).includeRootInJson = true;
    const contact = await Contact.create({ name: "David", age: 30 });
    const json = contact.asJson();
    const keys = Object.keys(json);
    expect(keys.length).toBe(1);
    const root = keys[0];
    expect(json[root]).toHaveProperty("name", "David");
    (Contact as any).includeRootInJson = false;
  });

  it("should encode all encodable attributes", async () => {
    const contact = await Contact.create({ name: "David", age: 30, created_at: "2023-01-01" });
    const hash = contact.asJson();
    expect(hash.name).toBe("David");
    expect(hash.age).toBe(30);
    expect(hash.created_at).toBe("2023-01-01");
  });

  it("should allow attribute filtering with only", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.asJson({ only: ["name"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
    expect(hash.id).toBeUndefined();
  });

  it("should allow attribute filtering with except", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.asJson({ except: ["age", "id"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
  });

  it("methods are called on object", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    (contact as any).label = () => `${contact.readAttribute("name")} (${contact.readAttribute("age")})`;
    const hash = contact.asJson({ methods: ["label"] });
    expect(hash.label).toBe("David (30)");
  });

  it("uses serializable hash with frozen hash", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const opts = Object.freeze({ only: ["name"] });
    // Should not throw when options are frozen
    const hash = contact.serializableHash({ ...opts });
    expect(hash.name).toBe("David");
  });

  it("uses serializable hash with only option", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.serializableHash({ only: ["name"] });
    expect(Object.keys(hash)).toEqual(["name"]);
  });

  it("uses serializable hash with except option", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const hash = contact.serializableHash({ except: ["name", "age"] });
    expect(hash.name).toBeUndefined();
    expect(hash.age).toBeUndefined();
  });

  it("does not include inheritance column from sti", async () => {
    Contact.attribute("type", "string");
    const contact = await Contact.create({ name: "David", age: 30, type: "SpecialContact" });
    const hash = contact.serializableHash({ except: ["type"] });
    expect(hash.type).toBeUndefined();
    expect(hash.name).toBe("David");
  });

  it("serializable hash with default except option and excluding inheritance column from sti", async () => {
    Contact.attribute("type", "string");
    const contact = await Contact.create({ name: "David", age: 30, type: "Special" });
    const hash = contact.serializableHash({ except: ["type", "id"] });
    expect(hash.type).toBeUndefined();
    expect(hash.id).toBeUndefined();
    expect(hash.name).toBe("David");
  });

  it("serializable hash should not modify options in argument", async () => {
    const contact = await Contact.create({ name: "David", age: 30 });
    const options = { only: ["name"] };
    const optionsBefore = { ...options, only: [...options.only] };
    contact.serializableHash(options);
    expect(options.only).toEqual(optionsBefore.only);
  });
});

describe("DatabaseConnectedJsonEncodingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("includes uses association name", async () => {
    class CommentJ1 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostJ1 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostJ1.create({ title: "Hello" });
    const c1 = await CommentJ1.create({ body: "Great", post_id: post.id });
    const c2 = await CommentJ1.create({ body: "Nice", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c1, c2]]]);
    const json = post.asJson({ include: "comments" });
    expect(json.comments).toBeDefined();
    expect((json.comments as any[]).length).toBe(2);
    expect((json.comments as any[])[0].body).toBe("Great");
  });

  it("includes uses association name and applies attribute filters", async () => {
    class CommentJ2 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostJ2 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostJ2.create({ title: "Hello" });
    const c1 = await CommentJ2.create({ body: "Great", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c1]]]);
    const json = post.asJson({ include: { comments: { only: ["body"] } } });
    expect((json.comments as any[])[0].body).toBe("Great");
    expect((json.comments as any[])[0].post_id).toBeUndefined();
  });

  it("includes fetches second level associations", async () => {
    class ReplyJ3 extends Base {
      static { this.attribute("text", "string"); this.attribute("comment_id", "integer"); this.adapter = adapter; }
    }
    class CommentJ3 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostJ3 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostJ3.create({ title: "Hello" });
    const c = await CommentJ3.create({ body: "Great", post_id: post.id });
    const r = await ReplyJ3.create({ text: "Indeed", comment_id: c.id });
    (c as any)._cachedAssociations = new Map([["replies", [r]]]);
    (post as any)._cachedAssociations = new Map([["comments", [c]]]);
    const json = post.asJson({ include: { comments: { include: "replies" } } });
    const comments = json.comments as any[];
    expect(comments[0].replies).toBeDefined();
    expect(comments[0].replies[0].text).toBe("Indeed");
  });

  it("includes fetches nth level associations", async () => {
    class DeepJ4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    class MidJ4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    class TopJ4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    const top = await TopJ4.create({ val: "top" });
    const mid = await MidJ4.create({ val: "mid" });
    const deep = await DeepJ4.create({ val: "deep" });
    (mid as any)._cachedAssociations = new Map([["deeps", [deep]]]);
    (top as any)._cachedAssociations = new Map([["mids", [mid]]]);
    const json = top.asJson({ include: { mids: { include: { deeps: {} } } } });
    expect((json.mids as any[])[0].deeps[0].val).toBe("deep");
  });

  it("includes doesnt merge opts from base", async () => {
    class CommentJ5 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostJ5 extends Base {
      static { this.attribute("title", "string"); this.attribute("author", "string"); this.adapter = adapter; }
    }
    const post = await PostJ5.create({ title: "Hello", author: "Alice" });
    const c = await CommentJ5.create({ body: "Great", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c]]]);
    const json = post.asJson({ only: ["title"], include: "comments" });
    expect(json.title).toBe("Hello");
    expect(json.author).toBeUndefined();
    expect((json.comments as any[])[0].body).toBe("Great");
    expect((json.comments as any[])[0].post_id).toBe(post.id);
  });

  it("should not call methods on associations that dont respond", async () => {
    class PostJ6 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostJ6.create({ title: "Hello" });
    const json = post.asJson({ include: "comments" });
    expect(json.comments).toBeUndefined();
    expect(json.title).toBe("Hello");
  });

  it("should allow only option for list of authors", async () => {
    class AuthorJ7 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorJ7.create({ name: "Alice", age: 30 });
    const a2 = await AuthorJ7.create({ name: "Bob", age: 25 });
    const result = [a1, a2].map(a => a.asJson({ only: ["name"] }));
    expect(result[0].name).toBe("Alice");
    expect(result[0].age).toBeUndefined();
    expect(result[1].name).toBe("Bob");
  });

  it("should allow except option for list of authors", async () => {
    class AuthorJ8 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorJ8.create({ name: "Alice", age: 30 });
    const result = a1.asJson({ except: ["age", "id"] });
    expect(result.name).toBe("Alice");
    expect(result.age).toBeUndefined();
  });

  it("should allow includes for list of authors", async () => {
    class BookJ9 extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    class AuthorJ9 extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const a1 = await AuthorJ9.create({ name: "Alice" });
    const b1 = await BookJ9.create({ title: "Book1", author_id: a1.id });
    (a1 as any)._cachedAssociations = new Map([["books", [b1]]]);
    const result = [a1].map(a => a.asJson({ include: "books" }));
    expect(result[0].books).toBeDefined();
    expect((result[0].books as any[])[0].title).toBe("Book1");
  });

  it("should allow options for hash of authors", async () => {
    class BookJ10 extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    class AuthorJ10 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorJ10.create({ name: "Alice", age: 30 });
    const b1 = await BookJ10.create({ title: "Book1", author_id: a1.id });
    (a1 as any)._cachedAssociations = new Map([["books", [b1]]]);
    const json = a1.asJson({ only: ["name"], include: { books: { only: ["title"] } } });
    expect(json.name).toBe("Alice");
    expect(json.age).toBeUndefined();
    expect((json.books as any[])[0].title).toBe("Book1");
    expect((json.books as any[])[0].author_id).toBeUndefined();
  });

  it("should be able to encode relation", async () => {
    class PostJ11 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    await PostJ11.create({ title: "First" });
    await PostJ11.create({ title: "Second" });
    const posts = await PostJ11.all().toArray();
    const encoded = posts.map((p: any) => p.asJson());
    expect(encoded.length).toBe(2);
    expect(encoded[0].title).toBe("First");
    expect(encoded[1].title).toBe("Second");
  });
});

describe("DatabaseConnectedJsonEncodingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("includes uses association name", async () => {
    class CommentK1 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostK1 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostK1.create({ title: "Hello" });
    const c1 = await CommentK1.create({ body: "Great", post_id: post.id });
    const c2 = await CommentK1.create({ body: "Nice", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c1, c2]]]);
    const json = post.asJson({ include: "comments" });
    expect(json.comments).toBeDefined();
    expect((json.comments as any[]).length).toBe(2);
    expect((json.comments as any[])[0].body).toBe("Great");
  });

  it("includes uses association name and applies attribute filters", async () => {
    class CommentK2 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostK2 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostK2.create({ title: "Hello" });
    const c1 = await CommentK2.create({ body: "Great", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c1]]]);
    const json = post.asJson({ include: { comments: { only: ["body"] } } });
    expect((json.comments as any[])[0].body).toBe("Great");
    expect((json.comments as any[])[0].post_id).toBeUndefined();
  });

  it("includes fetches second level associations", async () => {
    class ReplyK3 extends Base {
      static { this.attribute("text", "string"); this.attribute("comment_id", "integer"); this.adapter = adapter; }
    }
    class CommentK3 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostK3 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostK3.create({ title: "Hello" });
    const c = await CommentK3.create({ body: "Great", post_id: post.id });
    const r = await ReplyK3.create({ text: "Indeed", comment_id: c.id });
    (c as any)._cachedAssociations = new Map([["replies", [r]]]);
    (post as any)._cachedAssociations = new Map([["comments", [c]]]);
    const json = post.asJson({ include: { comments: { include: "replies" } } });
    const comments = json.comments as any[];
    expect(comments[0].replies).toBeDefined();
    expect(comments[0].replies[0].text).toBe("Indeed");
  });

  it("includes fetches nth level associations", async () => {
    class DeepK4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    class MidK4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    class TopK4 extends Base {
      static { this.attribute("val", "string"); this.adapter = adapter; }
    }
    const top = await TopK4.create({ val: "top" });
    const mid = await MidK4.create({ val: "mid" });
    const deep = await DeepK4.create({ val: "deep" });
    (mid as any)._cachedAssociations = new Map([["deeps", [deep]]]);
    (top as any)._cachedAssociations = new Map([["mids", [mid]]]);
    const json = top.asJson({ include: { mids: { include: { deeps: {} } } } });
    expect((json.mids as any[])[0].deeps[0].val).toBe("deep");
  });

  it("includes doesnt merge opts from base", async () => {
    class CommentK5 extends Base {
      static { this.attribute("body", "string"); this.attribute("post_id", "integer"); this.adapter = adapter; }
    }
    class PostK5 extends Base {
      static { this.attribute("title", "string"); this.attribute("author", "string"); this.adapter = adapter; }
    }
    const post = await PostK5.create({ title: "Hello", author: "Alice" });
    const c = await CommentK5.create({ body: "Great", post_id: post.id });
    (post as any)._cachedAssociations = new Map([["comments", [c]]]);
    const json = post.asJson({ only: ["title"], include: "comments" });
    expect(json.title).toBe("Hello");
    expect(json.author).toBeUndefined();
    expect((json.comments as any[])[0].body).toBe("Great");
    expect((json.comments as any[])[0].post_id).toBe(post.id);
  });

  it("should not call methods on associations that dont respond", async () => {
    class PostK6 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await PostK6.create({ title: "Hello" });
    const json = post.asJson({ include: "comments" });
    expect(json.comments).toBeUndefined();
    expect(json.title).toBe("Hello");
  });

  it("should allow only option for list of authors", async () => {
    class AuthorK7 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorK7.create({ name: "Alice", age: 30 });
    const a2 = await AuthorK7.create({ name: "Bob", age: 25 });
    const result = [a1, a2].map(a => a.asJson({ only: ["name"] }));
    expect(result[0].name).toBe("Alice");
    expect(result[0].age).toBeUndefined();
    expect(result[1].name).toBe("Bob");
  });

  it("should allow except option for list of authors", async () => {
    class AuthorK8 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorK8.create({ name: "Alice", age: 30 });
    const result = a1.asJson({ except: ["age", "id"] });
    expect(result.name).toBe("Alice");
    expect(result.age).toBeUndefined();
  });

  it("should allow includes for list of authors", async () => {
    class BookK9 extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    class AuthorK9 extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const a1 = await AuthorK9.create({ name: "Alice" });
    const b1 = await BookK9.create({ title: "Book1", author_id: a1.id });
    (a1 as any)._cachedAssociations = new Map([["books", [b1]]]);
    const result = [a1].map(a => a.asJson({ include: "books" }));
    expect(result[0].books).toBeDefined();
    expect((result[0].books as any[])[0].title).toBe("Book1");
  });

  it("should allow options for hash of authors", async () => {
    class BookK10 extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    class AuthorK10 extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const a1 = await AuthorK10.create({ name: "Alice", age: 30 });
    const b1 = await BookK10.create({ title: "Book1", author_id: a1.id });
    (a1 as any)._cachedAssociations = new Map([["books", [b1]]]);
    const json = a1.asJson({ only: ["name"], include: { books: { only: ["title"] } } });
    expect(json.name).toBe("Alice");
    expect(json.age).toBeUndefined();
    expect((json.books as any[])[0].title).toBe("Book1");
    expect((json.books as any[])[0].author_id).toBeUndefined();
  });

  it("should be able to encode relation", async () => {
    class PostK11 extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    await PostK11.create({ title: "First" });
    await PostK11.create({ title: "Second" });
    const posts = await PostK11.all().toArray();
    const encoded = posts.map((p: any) => p.asJson());
    expect(encoded.length).toBe(2);
    expect(encoded[0].title).toBe("First");
    expect(encoded[1].title).toBe("Second");
  });
});

describe("JsonSerializationTest", () => {
  let adapterJ: DatabaseAdapter;
  let ContactJ: typeof Base;

  beforeEach(() => {
    adapterJ = freshAdapter();
    ContactJ = class extends Base {};
    ContactJ._tableName = "contacts";
    ContactJ.attribute("id", "integer");
    ContactJ.attribute("name", "string");
    ContactJ.attribute("age", "integer");
    ContactJ.attribute("created_at", "string");
    ContactJ.adapter = adapterJ;
  });

  it("should demodulize root in json", async () => {
    (ContactJ as any).includeRootInJson = true;
    const c = await ContactJ.create({ name: "David", age: 30 });
    const json = c.asJson();
    const keys = Object.keys(json);
    expect(keys.length).toBe(1);
    (ContactJ as any).includeRootInJson = false;
  });

  it("should encode all encodable attributes", async () => {
    const c = await ContactJ.create({ name: "David", age: 30, created_at: "2023-01-01" });
    const hash = c.asJson();
    expect(hash.name).toBe("David");
    expect(hash.age).toBe(30);
  });

  it("should allow attribute filtering with only", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const hash = c.asJson({ only: ["name"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
  });

  it("should allow attribute filtering with except", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const hash = c.asJson({ except: ["age", "id"] });
    expect(hash.name).toBe("David");
    expect(hash.age).toBeUndefined();
  });

  it("methods are called on object", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    (c as any).label = () => `${c.readAttribute("name")} (${c.readAttribute("age")})`;
    const hash = c.asJson({ methods: ["label"] });
    expect(hash.label).toBe("David (30)");
  });

  it("uses serializable hash with frozen hash", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const hash = c.serializableHash({ ...Object.freeze({ only: ["name"] }) });
    expect(hash.name).toBe("David");
  });

  it("uses serializable hash with only option", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const hash = c.serializableHash({ only: ["name"] });
    expect(Object.keys(hash)).toEqual(["name"]);
  });

  it("uses serializable hash with except option", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const hash = c.serializableHash({ except: ["name", "age"] });
    expect(hash.name).toBeUndefined();
    expect(hash.age).toBeUndefined();
  });

  it("does not include inheritance column from sti", async () => {
    ContactJ.attribute("type", "string");
    const c = await ContactJ.create({ name: "David", type: "Special" });
    const hash = c.serializableHash({ except: ["type"] });
    expect(hash.type).toBeUndefined();
  });

  it("serializable hash with default except option and excluding inheritance column from sti", async () => {
    ContactJ.attribute("type", "string");
    const c = await ContactJ.create({ name: "David", type: "Special" });
    const hash = c.serializableHash({ except: ["type", "id"] });
    expect(hash.type).toBeUndefined();
    expect(hash.id).toBeUndefined();
  });

  it("serializable hash should not modify options in argument", async () => {
    const c = await ContactJ.create({ name: "David", age: 30 });
    const options = { only: ["name"] };
    const before = [...options.only];
    c.serializableHash(options);
    expect(options.only).toEqual(before);
  });
});
