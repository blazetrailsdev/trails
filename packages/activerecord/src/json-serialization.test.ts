import { describe, it, expect } from "vitest";
import { ActiveSupportJSON, assertNotRespondTo } from "@blazetrails/activesupport";
import { Base, registerModel } from "./index.js";

import { Contact, ContactSti } from "./test-helpers/models/contact.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";

import { fixtures } from "./test-fixtures.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

fixtures({}, { useTransactionalTests: false });

registerModel(Author);
registerModel(Post);
registerModel(Comment);
registerModel(Tag);
registerModel(Tagging);

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
      const json = JSON.stringify(contact.asJson());
      expect(json).toMatch(/^\{"namespaced_contact":\{/);
    });
  });

  it("should include root in json", () => {
    setIncludeRootInJson(true, () => {
      const json = JSON.stringify(newContact().asJson());

      expect(json).toMatch(/^\{"contact":\{/);
      expect(json).toMatch(/"name":"Konata Izumi"/);
      expect(json).toMatch(/"age":16/);
      expect(json).toContain(
        `"created_at":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
      );
      expect(json).toMatch(/"awesome":true/);
      expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
    });
  });

  it("should encode all encodable attributes", () => {
    const json = JSON.stringify(newContact().asJson());

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).toContain(
      `"created_at":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"awesome":true/);
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should allow attribute filtering with only", () => {
    const json = JSON.stringify(newContact().asJson({ only: ["name", "age"] }));

    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"age":16/);
    expect(json).not.toMatch(/"awesome":true/);
    expect(json).not.toContain(
      `"created_at":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).not.toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("should allow attribute filtering with except", () => {
    const json = JSON.stringify(newContact().asJson({ except: ["name", "age"] }));

    expect(json).not.toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/"age":16/);
    expect(json).toMatch(/"awesome":true/);
    expect(json).toContain(
      `"created_at":${ActiveSupportJSON.encode(new Date(Date.UTC(2006, 7, 1)))}`,
    );
    expect(json).toMatch(/"preferences":\{"shows":"anime"\}/);
  });

  it("methods are called on object", () => {
    const contact = newContact();
    (contact as unknown as { label: () => string }).label = () => "Has cheezburger";
    (contact as unknown as { favoriteQuote: () => string }).favoriteQuote = () =>
      "Constraints are liberating";

    expect(JSON.stringify(contact.asJson({ only: "name", methods: "label" }))).toMatch(
      /"label":"Has cheezburger"/,
    );

    const methodsJson = JSON.stringify(
      contact.asJson({ only: "name", methods: ["label", "favoriteQuote"] }),
    );
    expect(methodsJson).toMatch(/"label":"Has cheezburger"/);
    expect(methodsJson).toMatch(/"favoriteQuote":"Constraints are liberating"/);
  });

  it("uses serializable hash with frozen hash", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function (this: Base) {
      return Base.prototype.serializableHash.call(this, Object.freeze({ only: ["name"] }));
    };

    const json = JSON.stringify(contact.asJson());
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/awesome/);
    expect(json).not.toMatch(/age/);
  });

  it("uses serializable hash with only option", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function (this: Base) {
      return Base.prototype.serializableHash.call(this, { only: ["name"] });
    };

    const json = JSON.stringify(contact.asJson());
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/awesome/);
    expect(json).not.toMatch(/age/);
  });

  it("uses serializable hash with except option", () => {
    const contact = newContact();
    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function (this: Base) {
      return Base.prototype.serializableHash.call(this, { except: ["age"] });
    };

    const json = JSON.stringify(contact.asJson());
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).toMatch(/"awesome":true/);
    expect(json).not.toMatch(/age/);
  });

  it("does not include inheritance column from sti", () => {
    const contact = new ContactSti(newContact().attributes);
    expect(contact.type).toBe("ContactSti");

    const json = JSON.stringify(contact.asJson());
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/type/);
    expect(json).not.toMatch(/ContactSti/);
  });

  it("serializable hash with default except option and excluding inheritance column from sti", () => {
    const contact = new ContactSti(newContact().attributes);
    expect(contact.type).toBe("ContactSti");

    (
      contact as unknown as { serializableHash: (o?: unknown) => Record<string, unknown> }
    ).serializableHash = function (this: Base, options?: unknown) {
      return Base.prototype.serializableHash.call(this, {
        except: ["age"],
        ...((options as Record<string, unknown>) ?? {}),
      });
    };

    const json = JSON.stringify(contact.asJson());
    expect(json).toMatch(/"name":"Konata Izumi"/);
    expect(json).not.toMatch(/age/);
    expect(json).not.toMatch(/type/);
    expect(json).not.toMatch(/ContactSti/);
  });

  it("serializable hash should not modify options in argument", () => {
    const contact = newContact();
    const options = Object.freeze({ only: ["name"] });
    expect(() => contact.serializableHash(options)).not.toThrow();
  });
});

describe("DatabaseConnectedJsonEncodingTest", () => {
  const { authors } = fixtures(
    ["authors", "authorAddresses", "posts", "comments", "tags", "taggings"],
    { useTransactionalTests: true },
  );

  const getDavid = () => Author.find(authors("david").id);
  const getMary = () => Author.find(authors("mary").id);

  it("includes uses association name", async () => {
    const david = await getDavid();
    const json = JSON.stringify(await david.asJson({ include: "posts" }));

    expect(json).toMatch(/"posts":\[/);

    expect(json).toMatch(/"id":1/);
    expect(json).toMatch(/"name":"David"/);

    expect(json).toMatch(/"author_id":1/);
    expect(json).toMatch(/"title":"Welcome to the weblog"/);
    expect(json).toMatch(/"body":"Such a lovely day"/);

    expect(json).toMatch(/"title":"So I was thinking"/);
    expect(json).toMatch(/"body":"Like I hopefully always am"/);
  });

  it("includes uses association name and applies attribute filters", async () => {
    const david = await getDavid();
    const json = JSON.stringify(await david.asJson({ include: { posts: { only: "title" } } }));

    expect(json).toMatch(/"name":"David"/);
    expect(json).toMatch(/"posts":\[/);

    expect(json).toMatch(/"title":"Welcome to the weblog"/);
    expect(json).not.toMatch(/"body":"Such a lovely day"/);

    expect(json).toMatch(/"title":"So I was thinking"/);
    expect(json).not.toMatch(/"body":"Like I hopefully always am"/);
  });

  it("includes fetches second level associations", async () => {
    const david = await getDavid();
    const json = JSON.stringify(
      await david.asJson({ include: { posts: { include: { comments: { only: "body" } } } } }),
    );

    expect(json).toMatch(/"name":"David"/);
    expect(json).toMatch(/"posts":\[/);

    expect(json).toMatch(/"comments":\[/);
    expect(json).toMatch(/\{"body":"Thank you again for the welcome"\}/);
    expect(json).toMatch(/\{"body":"Don't think too hard"\}/);
    expect(json).not.toMatch(/"post_id":/);
  });

  it("includes fetches nth level associations", async () => {
    const david = await getDavid();
    const json = JSON.stringify(
      await david.asJson({
        include: {
          posts: {
            include: {
              taggings: {
                include: {
                  tag: { only: "name" },
                },
              },
            },
          },
        },
      }),
    );

    expect(json).toMatch(/"name":"David"/);
    expect(json).toMatch(/"posts":\[/);

    expect(json).toMatch(/"taggings":\[/);
    expect(json).toMatch(/"tag":\{"name":"General"\}/);
  });

  it("includes doesnt merge opts from base", async () => {
    const david = await getDavid();
    const json = JSON.stringify(
      await david.asJson({
        only: "id",
        include: "posts",
      }),
    );

    expect(json).toMatch('"title":"Welcome to the weblog"');
  });

  it("should not call methods on associations that dont respond", async () => {
    const david = await getDavid();
    (david as unknown as { favoriteQuote: () => string }).favoriteQuote = () =>
      "Constraints are liberating";
    const json = JSON.stringify(
      await david.asJson({ include: "posts", methods: ["favoriteQuote"] }),
    );

    assertNotRespondTo((await david.posts.first())!, "favoriteQuote");
    expect(json).toMatch(/"favoriteQuote":"Constraints are liberating"/);
    expect(json.match(/"favoriteQuote":/g)!.length).toBe(1);
  });

  it("should allow only option for list of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    setIncludeRootInJson(false, () => {
      const authorsList = [david, mary];
      expect(ActiveSupportJSON.encode(authorsList, { only: "name" })).toBe(
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
      const decoded = (JSON.parse(encoded) as Array<{ id: unknown }>).map((o) => ({
        id: Number(o.id),
      }));
      expect(decoded).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  it("should allow includes for list of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    const json = JSON.stringify(
      await Promise.all(
        [david, mary].map((a) => a.asJson({ only: "name", include: { posts: { only: "id" } } })),
      ),
    );

    for (const fragment of [
      '"name":"David"',
      '"posts":[',
      '{"id":1}',
      '{"id":2}',
      '{"id":4}',
      '{"id":5}',
      '{"id":6}',
      '"name":"Mary"',
      '"posts":[',
      '{"id":7}',
      '{"id":9}',
    ]) {
      expect(json).toContain(fragment);
    }
  });

  it("should allow options for hash of authors", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    setIncludeRootInJson(true, () => {
      const authorsHash: Record<number, Author> = { 1: david, 2: mary };
      expect(ActiveSupportJSON.encode(authorsHash, { only: [1, "name"] })).toBe(
        '{"1":{"author":{"name":"David"}}}',
      );
    });
  });

  it("should be able to encode relation", async () => {
    const [david, mary] = [await getDavid(), await getMary()];
    await setIncludeRootInJsonAsync(true, async () => {
      const relation = await Author.where({ id: [david.id, mary.id] }).order("id");
      const encoded = ActiveSupportJSON.encode(relation, { only: "name" });
      expect(encoded).toBe('[{"author":{"name":"David"}},{"author":{"name":"Mary"}}]');
    });
  });

  it("raises when including an unloaded has_many (sync serialization cannot query)", async () => {
    const post = await Post.find(1);
    expect(() => post.asJson({ include: "comments" }).comments).toThrow(/not loaded/);
    expect(() => JSON.stringify(post.asJson({ include: "comments" }))).toThrow(/not loaded/);
    expect(() => post.asJson({ include: "comments" }).title).toThrow(/not loaded/);
  });

  it("without an include the hash is plain (no awaitable contract)", async () => {
    const post = await Post.find(1);
    expect((post.asJson() as { then?: unknown }).then).toBeUndefined();
    expect((post.serializableHash() as { then?: unknown }).then).toBeUndefined();
  });

  it("awaiting loads an unloaded belongs_to and serializes the row", async () => {
    const comment = await Comment.find(1);
    const json = await comment.asJson({ only: ["body"], include: "post" });
    expect((json.post as Record<string, unknown>).title).toBe("Welcome to the weblog");

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
    expect(typeof JSON.stringify(json)).toBe("string");
  });
});

async function setIncludeRootInJsonAsync(value: boolean, fn: () => Promise<void>): Promise<void> {
  const original = Base.includeRootInJson;
  Base.includeRootInJson = value;
  try {
    await fn();
  } finally {
    Base.includeRootInJson = original;
  }
}
