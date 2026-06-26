/**
 * Mirrors: vendor/rails/activerecord/test/cases/json_serialization_test.rb
 *
 * Faithful port of Rails' JsonSerializationTest and
 * DatabaseConnectedJsonEncodingTest. Rides the canonical models
 * (Contact / ContactSti / Author / Post / Comment / Tag / Tagging) — declares
 * NO bespoke `defineSchema`. The first suite exercises the in-memory `Contact`
 * (a fake-adapter model in Rails, never persisted); the second drives the real
 * `authors`/`posts`/`comments`/`tags`/`taggings` fixtures via the handler suite,
 * loading rows through `name(:label)` registry lookups exactly like Rails'
 * `authors(:david)`.
 *
 * Test names mirror the Ruby method names verbatim (`test:compare` matches on
 * them). The trailing trails-specific cases (sync fail-loud / awaitable
 * contract) have no Rails analog but ride the same canonical tables.
 */
import { describe, it, expect } from "vitest";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { Base, registerModel } from "./index.js";

import { Contact, ContactSti } from "./test-helpers/models/contact.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

// Establish the worker's canonical template DB for the whole file so the
// in-memory `Contact` suite below doesn't lazily initialize a bare connection
// that would shadow the handler clone for the fixture-backed suite.
setupHandlerSuite();

registerModel(Author);
registerModel(Post);
registerModel(Comment);
registerModel(Tag);
registerModel(Tagging);

// Rails' `JsonSerializationHelpers#set_include_root_in_json` — toggle the
// class-level flag for the duration of the block, then restore.
function setIncludeRootInJson(value: boolean, fn: () => void): void {
  const original = Base.includeRootInJson;
  Base.includeRootInJson = value;
  try {
    fn();
  } finally {
    Base.includeRootInJson = original;
  }
}

describe("JsonSerializationTest", () => {
  // Rails: `class NamespacedContact < Contact; column :name, "string"; end`.
  class NamespacedContact extends Contact {}

  function newContact(): Contact {
    return new Contact({
      name: "Konata Izumi",
      age: 16,
      avatar: "binarydata",
      created_at: new Date(Date.UTC(2006, 7, 1)),
      awesome: true,
      preferences: { shows: "anime" },
    });
  }

  it("should demodulize root in json", () => {
    setIncludeRootInJson(true, () => {
      const contact = new NamespacedContact({ name: "whatever" });
      const json = contact.asJson();
      const keys = Object.keys(json);
      expect(keys.length).toBe(1);
      expect(keys[0]).toBe("namespaced_contact");
    });
  });

  it("should include root in json", () => {
    setIncludeRootInJson(true, () => {
      const json = newContact().asJson();
      const keys = Object.keys(json);
      expect(keys).toEqual(["contact"]);
      const root = json.contact as Record<string, unknown>;
      expect(root.name).toBe("Konata Izumi");
      expect(root.age).toBe(16);
      expect(root.created_at).toBeDefined();
      expect(root.awesome).toBe(true);
      expect(root.preferences).toEqual({ shows: "anime" });
    });
  });

  it("should encode all encodable attributes", () => {
    const json = newContact().asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.age).toBe(16);
    expect(json.created_at).toBeDefined();
    expect(json.awesome).toBe(true);
    expect(json.preferences).toEqual({ shows: "anime" });
  });

  it("should allow attribute filtering with only", () => {
    const json = newContact().asJson({ only: ["name", "age"] });
    expect(json.name).toBe("Konata Izumi");
    expect(json.age).toBe(16);
    expect(json.awesome).toBeUndefined();
    expect(json.created_at).toBeUndefined();
    expect(json.preferences).toBeUndefined();
  });

  it("should allow attribute filtering with except", () => {
    const json = newContact().asJson({ except: ["name", "age"] });
    expect(json.name).toBeUndefined();
    expect(json.age).toBeUndefined();
    expect(json.awesome).toBe(true);
    expect(json.created_at).toBeDefined();
    expect(json.preferences).toEqual({ shows: "anime" });
  });

  it("methods are called on object", () => {
    const contact = newContact();
    (contact as unknown as { label: () => string }).label = () => "Has cheezburger";
    (contact as unknown as { favoriteQuote: () => string }).favoriteQuote = () =>
      "Constraints are liberating";

    // Single method.
    const single = contact.asJson({ only: ["name"], methods: ["label"] });
    expect(single.label).toBe("Has cheezburger");

    // Both methods.
    const both = contact.asJson({ only: ["name"], methods: ["label", "favoriteQuote"] });
    expect(both.label).toBe("Has cheezburger");
    expect(both.favoriteQuote).toBe("Constraints are liberating");
  });

  it("uses serializable hash with frozen hash", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function () {
      return Base.prototype.serializableHash.call(this, Object.freeze({ only: ["name"] }));
    };

    const json = contact.asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.awesome).toBeUndefined();
    expect(json.age).toBeUndefined();
  });

  it("uses serializable hash with only option", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function () {
      return Base.prototype.serializableHash.call(this, { only: ["name"] });
    };

    const json = contact.asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.awesome).toBeUndefined();
    expect(json.age).toBeUndefined();
  });

  it("uses serializable hash with except option", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function () {
      return Base.prototype.serializableHash.call(this, { except: ["age"] });
    };

    const json = contact.asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.awesome).toBe(true);
    expect(json.age).toBeUndefined();
  });

  it("does not include inheritance column from sti", () => {
    const contact = new ContactSti(newContact().attributes);
    expect(contact.type).toBe("ContactSti");

    const json = contact.asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.type).toBeUndefined();
    expect(Object.values(json)).not.toContain("ContactSti");
  });

  it("serializable hash with default except option and excluding inheritance column from sti", () => {
    const contact = new ContactSti(newContact().attributes);
    expect(contact.type).toBe("ContactSti");

    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function (options?: unknown) {
      return Base.prototype.serializableHash.call(this, {
        except: ["age"],
        ...((options as Record<string, unknown>) ?? {}),
      });
    };

    const json = contact.asJson();
    expect(json.name).toBe("Konata Izumi");
    expect(json.age).toBeUndefined();
    expect(json.type).toBeUndefined();
    expect(Object.values(json)).not.toContain("ContactSti");
  });

  it("serializable hash should not modify options in argument", () => {
    const contact = newContact();
    const options = Object.freeze({ only: ["name"] });
    expect(() => contact.serializableHash(options)).not.toThrow();
  });
});

describe("DatabaseConnectedJsonEncodingTest", () => {
  const { authors } = useHandlerFixtures([
    "authors",
    "authorAddresses",
    "posts",
    "comments",
    "tags",
    "taggings",
  ]);

  const getDavid = () => Author.find(authors("david").id);
  const getMary = () => Author.find(authors("mary").id);

  it("includes uses association name", async () => {
    const david = await getDavid();
    const json = await david.asJson({ include: "posts" });

    const posts = json.posts as Array<Record<string, unknown>>;
    expect(Array.isArray(posts)).toBe(true);
    // Postgres returns bigint ids as strings; compare numerically (Rails emits
    // an integer either way).
    expect(Number(json.id)).toBe(1);
    expect(json.name).toBe("David");

    const welcome = posts.find((p) => p.title === "Welcome to the weblog")!;
    expect(Number(welcome.author_id)).toBe(1);
    expect(welcome.body).toBe("Such a lovely day");

    const thinking = posts.find((p) => p.title === "So I was thinking")!;
    expect(thinking.body).toBe("Like I hopefully always am");
  });

  it("includes uses association name and applies attribute filters", async () => {
    const david = await getDavid();
    const json = await david.asJson({ include: { posts: { only: ["title"] } } });

    expect(json.name).toBe("David");
    const posts = json.posts as Array<Record<string, unknown>>;
    expect(Array.isArray(posts)).toBe(true);

    const welcome = posts.find((p) => p.title === "Welcome to the weblog")!;
    expect(welcome.title).toBe("Welcome to the weblog");
    expect(welcome.body).toBeUndefined();

    expect(posts.some((p) => p.title === "So I was thinking")).toBe(true);
  });

  it("includes fetches second level associations", async () => {
    const david = await getDavid();
    const json = await david.asJson({
      include: { posts: { include: { comments: { only: ["body"] } } } },
    });

    expect(json.name).toBe("David");
    const posts = json.posts as Array<Record<string, unknown>>;
    const bodies = posts.flatMap((p) =>
      (p.comments as Array<Record<string, unknown>>).map((c) => c.body),
    );
    expect(bodies).toContain("Thank you again for the welcome");
    expect(bodies).toContain("Don't think too hard");
    // `only: :body` filters out post_id on the nested comments.
    for (const p of posts) {
      for (const c of p.comments as Array<Record<string, unknown>>) {
        expect(c.post_id).toBeUndefined();
      }
    }
  });

  it("includes fetches nth level associations", async () => {
    const david = await getDavid();
    const json = await david.asJson({
      include: { posts: { include: { taggings: { include: { tag: { only: ["name"] } } } } } },
    });

    expect(json.name).toBe("David");
    const posts = json.posts as Array<Record<string, unknown>>;
    const tags = posts.flatMap((p) =>
      (p.taggings as Array<Record<string, unknown>>).map((t) => t.tag as Record<string, unknown>),
    );
    expect(tags).toContainEqual({ name: "General" });
  });

  it("includes doesnt merge opts from base", async () => {
    const david = await getDavid();
    const json = await david.asJson({ only: ["id"], include: "posts" });
    const posts = json.posts as Array<Record<string, unknown>>;
    expect(posts.some((p) => p.title === "Welcome to the weblog")).toBe(true);
  });

  it("should not call methods on associations that dont respond", async () => {
    const david = await getDavid();
    (david as unknown as { favoriteQuote: () => string }).favoriteQuote = () =>
      "Constraints are liberating";
    const json = await david.asJson({ include: "posts", methods: ["favoriteQuote"] });

    expect(json.favoriteQuote).toBe("Constraints are liberating");
    const posts = json.posts as Array<Record<string, unknown>>;
    for (const p of posts) {
      expect(p.favoriteQuote).toBeUndefined();
    }
  });

  it("should allow only option for list of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    setIncludeRootInJson(false, () => {
      const authorsList = [david, mary];
      expect(ActiveSupportJSON.encode(authorsList, { only: ["name"] })).toBe(
        '[{"name":"David"},{"name":"Mary"}]',
      );
    });
  });

  it("should allow except option for list of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    setIncludeRootInJson(false, () => {
      const authorsList = [david, mary];
      const encoded = ActiveSupportJSON.encode(authorsList, {
        except: [
          "name",
          "author_address_id",
          "author_address_extra_id",
          "organization_id",
          "owned_essay_id",
        ],
      });
      // Rails emits `[{"id":1},{"id":2}]`; Postgres serializes bigint ids as
      // strings, so normalize the id values before comparing (the single-key
      // `except` shape is still pinned).
      const decoded = (JSON.parse(encoded) as Array<{ id: unknown }>).map((o) => ({
        id: Number(o.id),
      }));
      expect(decoded).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  it("should allow includes for list of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    const json = await Promise.all(
      [david, mary].map((a) => a.asJson({ only: ["name"], include: { posts: { only: ["id"] } } })),
    );

    const davidPosts = (json[0].posts as Array<Record<string, unknown>>).map((p) => Number(p.id));
    expect(json[0].name).toBe("David");
    for (const id of [1, 2, 4, 5, 6]) expect(davidPosts).toContain(id);

    const maryPosts = (json[1].posts as Array<Record<string, unknown>>).map((p) => Number(p.id));
    expect(json[1].name).toBe("Mary");
    for (const id of [7, 9]) expect(maryPosts).toContain(id);
  });

  it("should allow options for hash of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    setIncludeRootInJson(true, () => {
      const authorsHash: Record<number, Author> = { 1: david, 2: mary };
      // Rails filters the hash by key (`only: [1, :name]` keeps key 1 only),
      // then serializes each surviving author with the same options (`:name`).
      expect(ActiveSupportJSON.encode(authorsHash, { only: [1, "name"] })).toBe(
        '{"1":{"author":{"name":"David"}}}',
      );
    });
  });

  it("should be able to encode relation", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    await setIncludeRootInJsonAsync(true, async () => {
      const relation = await Author.where({ id: [david.id, mary.id] })
        .order("id")
        .toArray();
      const encoded = ActiveSupportJSON.encode(relation, { only: ["name"] });
      expect(encoded).toBe('[{"author":{"name":"David"}},{"author":{"name":"Mary"}}]');
    });
  });

  // -- trails-specific: synchronous fail-loud / awaitable contract --

  it("raises when including an unloaded has_many (sync serialization cannot query)", async () => {
    // Rails' `to_ary` would lazily load the rows; trails serialization is
    // synchronous and must not query, so an unloaded collection fails loud
    // rather than silently serializing as `[]`.
    const post = await Post.find(1);
    expect(() => post.asJson({ include: "comments" }).comments).toThrow(/not loaded/);
    expect(() => JSON.stringify(post.asJson({ include: "comments" }))).toThrow(/not loaded/);
    // Fail-loud is all-or-nothing: reading any key (not just the include) throws.
    expect(() => post.asJson({ include: "comments" }).title).toThrow(/not loaded/);
  });

  it("without an include the hash is plain (no awaitable contract)", async () => {
    const post = await Post.find(1);
    // No `:include` → Rails-plain Hash with no `then` for assimilation to catch.
    expect((post.asJson() as { then?: unknown }).then).toBeUndefined();
    expect((post.serializableHash() as { then?: unknown }).then).toBeUndefined();
  });

  // Awaiting runs the async path: lazy-load unloaded includes (Rails' `to_ary`).
  it("awaiting loads an unloaded belongs_to and serializes the row", async () => {
    const comment = await Comment.find(1);
    const json = await comment.asJson({ only: ["body"], include: "post" });
    expect((json.post as Record<string, unknown>).title).toBe("Welcome to the weblog");

    // root + include on the async path exercises the `element()` thunk.
    Comment.includeRootInJson = true;
    try {
      const rooted = await comment.asJson({ only: ["body"], include: "post" });
      const rootKey = Object.keys(rooted)[0];
      expect(Object.keys(rooted).length).toBe(1);
      expect((rooted[rootKey] as { post: { title: string } }).post.title).toBe(
        "Welcome to the weblog",
      );
    } finally {
      Comment.includeRootInJson = false;
    }
  });

  it("awaiting loads unloaded has_many and nested includes", async () => {
    const post = await Post.find(1);
    const json = await post.asJson({
      include: { comments: { only: ["id", "body"], include: { children: { only: ["body"] } } } },
    });
    const comments = json.comments as Array<Record<string, unknown>>;
    const greetings = comments.find((c) => Number(c.id) === 1)!;
    expect(greetings.body).toBe("Thank you for the welcome");
    const children = greetings.children as Array<Record<string, unknown>>;
    expect(children[0].body).toBe("Thank you again for the welcome");
    // The awaited value is a plain object — JSON.stringify works normally.
    expect(typeof JSON.stringify(json)).toBe("string");
  });
});

// Async sibling of `setIncludeRootInJson` for the relation-encoding case.
async function setIncludeRootInJsonAsync(value: boolean, fn: () => Promise<void>): Promise<void> {
  const original = Base.includeRootInJson;
  Base.includeRootInJson = value;
  try {
    await fn();
  } finally {
    Base.includeRootInJson = original;
  }
}
