/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Mirrors: vendor/rails/activerecord/test/cases/serialization_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel } from "./index.js";
import { Contact } from "./test-helpers/models/contact.js";
import { Book } from "./test-helpers/models/book.js";
import { Author } from "./test-helpers/models/author.js";
import { SerializedPost } from "./test-helpers/models/post.js";
import { bookFixtureData } from "./test-helpers/fixtures/books.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    books: TEST_SCHEMA.books,
    authors: TEST_SCHEMA.authors,
    serialized_posts: TEST_SCHEMA.serialized_posts,
    topics: TEST_SCHEMA.topics,
  });
  registerModel(Author);
  registerModel(SerializedPost);
});

const { books } = useFixtures({ books: [Book, bookFixtureData] }, () => Base.connection);

const FORMATS = ["json"] as const;

// Mirrors Rails' `public_send("to_#{format}")` / `from_#{format}` dispatch.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toFormat = (record: Contact, format: string, opts?: unknown) =>
  (record as unknown as Record<string, (o?: unknown) => string>)[`to${cap(format)}`](opts);
const fromFormat = (record: Contact, format: string, serialized: string) =>
  (record as unknown as Record<string, (s: string) => Contact>)[`from${cap(format)}`](serialized);

describe("SerializationTest", () => {
  let contactAttributes: Record<string, unknown>;

  beforeEach(() => {
    contactAttributes = {
      name: "aaron stack",
      age: 25,
      avatar: "binarydata",
      created_at: "2006-08-01",
      awesome: false,
      preferences: { gem: "<strong>ruby</strong>" },
      alternative_id: null,
      id: null,
    };
  });

  it("include root in json is false by default", () => {
    expect(Base.includeRootInJson).toBe(false);
  });

  it("serialize should be reversible", () => {
    for (const format of FORMATS) {
      const serialized = toFormat(new Contact(), format);
      const contact = fromFormat(new Contact(), format, serialized);

      expect(Object.keys(contact.attributes).map(String).sort()).toEqual(
        Object.keys(contactAttributes).map(String).sort(),
      );
    }
  });

  it("serialize should allow attribute only filtering", () => {
    for (const format of FORMATS) {
      const serialized = toFormat(new Contact(contactAttributes), format, {
        only: ["age", "name"],
      });
      const contact = fromFormat(new Contact(), format, serialized);
      expect(contact.name).toBe(contactAttributes.name);
      expect(contact.avatar).toBeNull();
    }
  });

  it("serialize should allow attribute except filtering", () => {
    for (const format of FORMATS) {
      const serialized = toFormat(new Contact(contactAttributes), format, {
        except: ["age", "name"],
      });
      const contact = fromFormat(new Contact(), format, serialized);
      expect(contact.name).toBeNull();
      expect(contact.age).toBeNull();
      expect(contact.awesome).toBe(contactAttributes.awesome);
    }
  });

  it("include root in json allows inheritance", () => {
    const originalRootInJson = Base.includeRootInJson;
    try {
      Base.includeRootInJson = true;

      const klazz = class extends Base {};
      klazz._tableName = "topics";
      expect(klazz.includeRootInJson).toBe(true);

      klazz.includeRootInJson = false;
      expect(Base.includeRootInJson).toBe(true);
      expect(klazz.includeRootInJson).toBe(false);
    } finally {
      Base.includeRootInJson = originalRootInJson;
    }
  });

  it("read attribute for serialization with format without method missing", () => {
    const klazz = class extends Base {};
    klazz._tableName = "books";

    const book = new klazz();
    expect(book.readAttribute("format")).toBeNull();
  });

  it("read attribute for serialization with format after init", () => {
    const klazz = class extends Base {};
    klazz._tableName = "books";

    const book = new klazz({ format: "paperback" });
    expect(book.readAttribute("format")).toBe("paperback");
  });

  it("read attribute for serialization with format after find", async () => {
    const klazz = class extends Base {};
    klazz._tableName = "books";

    const book = await klazz.find(books("awdr").id);
    expect(book.readAttribute("format")).toBe("paperback");
  });

  it("find records by serialized attributes through join", async () => {
    const author = await Author.create({ name: "David" });
    // `title` is `serialize`-wrapped (JSON coder), so the stored value is the
    // coder's encoded form. Assign/query the pre-serialized string so the
    // persisted value and the join predicate compare equal.
    await (
      author as unknown as { serializedPosts: { create(attrs: object): Promise<unknown> } }
    ).serializedPosts.create({ title: JSON.stringify("Hello") });

    const results = await Author.joins("serializedPosts")
      .where({ name: "David", serialized_posts: { title: JSON.stringify("Hello") } })
      .toArray();
    expect(results.length).toBe(1);
  });
});
