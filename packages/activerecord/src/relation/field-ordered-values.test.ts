/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/field_ordered_values_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Book } from "../test-helpers/models/book.js";

describe("FieldOrderedValuesTest", () => {
  // Mirrors Rails `fixtures :posts`. The enum/string/nil book tests destroy_all
  // and create their own rows, so `books`/`authors` are defined (no fixtures).
  useHandlerFixtures(["posts"], { schema: canonicalSchema });
  beforeAll(async () => {
    await defineSchema({
      authors: canonicalSchema.authors,
      books: canonicalSchema.books,
    });
  });

  it("in order of", async () => {
    const order = [3, 4, 1];
    const posts = Post.inOrderOf("id", order);

    expect((await posts.toArray()).map((p: any) => p.id)).toEqual(order);
  });

  it("in order of empty", async () => {
    const posts = Post.inOrderOf("id", []);

    expect(await posts.toArray()).toEqual([]);
  });

  it.skip("in order of with enums values", async () => {
    // BLOCKED: in_order_of with enum keys (string labels) is unsupported —
    // the enum type-caster does not map label → integer for the CASE/IN values.
    await Book.destroyAll();
    await Book.create({ status: "proposed" });
    await Book.create({ status: "written" });
    await Book.create({ status: "published" });

    const order = ["written", "published", "proposed"];
    let books = Book.inOrderOf("status", order);
    expect((await books.toArray()).map((b: any) => b.status)).toEqual(order);

    books = Book.inOrderOf("status", order);
    expect((await books.toArray()).map((b: any) => b.status)).toEqual(order);
  });

  it("in order of with enums keys", async () => {
    await Book.destroyAll();
    await Book.create({ status: "proposed" });
    await Book.create({ status: "written" });
    await Book.create({ status: "published" });

    const statuses = (Book as any).statuses;
    const order = [statuses.written, statuses.published, statuses.proposed];
    const books = Book.inOrderOf("status", order);

    expect((await books.toArray()).map((book: any) => statuses[book.status])).toEqual(order);
  });

  it("in order of expression", async () => {
    const order = [3, 4, 1];
    const posts = Post.inOrderOf(
      arelSql("id * 2"),
      order.map((id) => id * 2),
    );

    expect((await posts.toArray()).map((p: any) => p.id)).toEqual(order);
  });

  it("in order of with string column", async () => {
    await Book.destroyAll();
    await Book.create({ format: "paperback" });
    await Book.create({ format: "ebook" });
    await Book.create({ format: "hardcover" });

    const order = ["hardcover", "paperback", "ebook"];
    let books = Book.inOrderOf("format", order);
    expect((await books.toArray()).map((b: any) => b.format)).toEqual(order);

    books = Book.inOrderOf("format", order);
    expect((await books.toArray()).map((b: any) => b.format)).toEqual(order);
  });

  it("in order of after regular order", async () => {
    const order = [3, 4, 1];
    let posts = Post.where({ type: "Post" }).order("type").inOrderOf("id", order);
    expect((await posts.toArray()).map((p: any) => p.id)).toEqual(order);

    posts = Post.where({ type: "Post" }).order("type").inOrderOf("id", order);
    expect((await posts.toArray()).map((p: any) => p.id)).toEqual(order);
  });

  it("in order of with nil", async () => {
    await Book.destroyAll();
    await Book.create({ format: "paperback" });
    await Book.create({ format: "ebook" });
    await Book.create({ format: null });

    const order = ["ebook", null, "paperback"];
    let books = Book.inOrderOf("format", order);
    expect((await books.toArray()).map((b: any) => b.format)).toEqual(order);

    books = Book.inOrderOf("format", order);
    expect((await books.toArray()).map((b: any) => b.format)).toEqual(order);
  });

  it.skip("in order of with associations", async () => {
    // BLOCKED: in_order_of over a joined association column ("authors.name")
    // is unsupported on the join path.
    const { Author } = await import("../test-helpers/models/author.js");
    await Author.destroyAll();
    await Book.destroyAll();
    const john = (await Author.create({ name: "John" })) as any;
    const bob = (await Author.create({ name: "Bob" })) as any;
    const anna = (await Author.create({ name: "Anna" })) as any;

    await john.books.create();
    await bob.books.create();
    await anna.books.create();

    const order = ["Bob", "Anna", "John"];
    let books = Book.joins("author").inOrderOf("authors.name", order);
    expect((await books.toArray()).map((book: any) => book.author.name)).toEqual(order);

    books = Book.joins("author").inOrderOf("authors.name", order);
    expect((await books.toArray()).map((book: any) => book.author.name)).toEqual(order);
  });

  it.skip("in order of with filter false", async () => {
    // BLOCKED: in_order_of(filter: false) — counting non-filtered relations is
    // unsupported (expects all 11 posts to remain with non-matching rows last).
    const order = [3, 4, 1];
    const posts = Post.inOrderOf("id", order, false);

    expect((await posts.limit(3).toArray()).map((p: any) => p.id)).toEqual(order);
    expect(await posts.count()).toBe(11);
  });
});
