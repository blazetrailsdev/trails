/**
 * Trails-internal harness for the thenable (Promise-like `.then`) relation
 * surface — `Relation`, `CollectionProxy`, and `BatchEnumerator` are all
 * directly awaitable. No 1:1 Rails counterpart; rides the canonical schema
 * (`Author` / `Post` / `Comment`) + fixtures, no inline tables.
 */
import { describe, it, expect } from "vitest";
import { Relation, association, registerModel } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);

describe("Thenable", () => {
  const { posts } = useHandlerFixtures(["authorAddresses", "authors", "posts", "comments"], {
    schema: canonicalSchema,
  });

  it("Relation is directly awaitable", async () => {
    const authors = await Author.where({ id: [1, 2] });
    expect(Array.isArray(authors)).toBe(true);
    expect(authors).toHaveLength(2);
  });

  it("Relation .then() chains work", async () => {
    const names = await Author.where({ id: [1, 2] }).then((records: Author[]) =>
      records.map((r) => r.readAttribute("name")),
    );
    expect(names).toContain("David");
    expect(names).toContain("Mary");
  });

  it("chained relation remains thenable", async () => {
    const authors = await Author.where({ id: [1, 2] })
      .order("name")
      .limit(1);
    expect(Array.isArray(authors)).toBe(true);
    expect(authors).toHaveLength(1);
    expect(authors[0].readAttribute("name")).toBe("David");
  });

  it("works with Promise.all", async () => {
    const [pair, single] = await Promise.all([
      Author.where({ id: [1, 2] }),
      Author.where({ id: [3] }),
    ]);
    expect(pair).toHaveLength(2);
    expect(single).toHaveLength(1);
  });

  it("does not eagerly evaluate on construction", async () => {
    const relation = Author.where({ id: [1, 2] });
    expect(relation.isLoaded).toBe(false);

    await relation;
    expect(relation.isLoaded).toBe(true);
  });

  it("Relation is not instanceof Promise", () => {
    const relation = Author.where({ id: [1, 2] });
    expect(relation).not.toBeInstanceOf(Promise);
  });

  it(".toArray() still works", async () => {
    const authors = await Author.where({ id: 1 }).toArray();
    expect(Array.isArray(authors)).toBe(true);
    expect(authors).toHaveLength(1);
  });

  it("load() returns the relation, not an array", async () => {
    const rel = Author.where({ id: 1 });
    const loaded = await rel.load();
    expect(loaded).toBeInstanceOf(Relation);
    expect(loaded.isLoaded).toBe(true);
  });

  it("reload() returns the relation, not an array", async () => {
    const rel = Author.where({ id: 1 });
    await rel.load();
    const reloaded = await rel.reload();
    expect(reloaded).toBeInstanceOf(Relation);
  });

  it("presence() returns the relation when records exist", async () => {
    const rel = Author.where({ id: 1 });
    const present = await rel.presence();
    expect(present).toBeInstanceOf(Relation);
  });

  it("presence() returns null when no records exist", async () => {
    const rel = Author.where({ id: 99 });
    const present = await rel.presence();
    expect(present).toBeNull();
  });

  describe("CollectionProxy", () => {
    it("CollectionProxy is directly awaitable", async () => {
      const post = posts("welcome");

      const proxy = association(post, "comments");
      const comments = await proxy;
      expect(Array.isArray(comments)).toBe(true);
      expect(comments).toHaveLength(2);
    });
  });

  describe("BatchEnumerator", () => {
    it("BatchEnumerator is directly awaitable", async () => {
      const batches = await Author.all().inBatches({ batchSize: 2 });
      expect(Array.isArray(batches)).toBe(true);
      expect(batches.length).toBeGreaterThan(0);
    });
  });
});
