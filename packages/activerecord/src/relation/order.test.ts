/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/order_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Book } from "../test-helpers/models/book.js";
import { Author } from "../test-helpers/models/author.js";

describe("OrderTest", () => {
  const { authors } = fixtures(["authors", "authorAddresses"]);
  // `authors`/`author_addresses`/`books` ride the boot-laid canonical schema
  // (RFC 0059 Phase 1); per-file `repairWorkerSchema` restores any sibling
  // drift, so no defensive recreate is needed here.
  registerModel(Author);
  registerModel(Book);

  beforeEach(async () => {
    await Book.deleteAll();
  });

  const ids = async (rel: any): Promise<unknown[]> => (await rel.toArray()).map((b: any) => b.id);
  const incOrder = (...args: any[]): Promise<unknown[]> =>
    ids(Book.includes("author").order(...args));

  it("order asc", async () => {
    const z = (await Book.create({ name: "Zulu", author: authors("david") })) as any;
    const y = (await Book.create({ name: "Yankee", author: authors("mary") })) as any;
    const x = (await Book.create({ name: "X-Ray", author: authors("david") })) as any;

    const alphabetical = [x.id, y.id, z.id];

    expect(await ids(Book.order({ name: "asc" }))).toEqual(alphabetical);
    expect(await ids(Book.order({ name: "ASC" }))).toEqual(alphabetical);
    expect(await ids(Book.order({ name: "asc" }))).toEqual(alphabetical);
    expect(await ids(Book.order("name"))).toEqual(alphabetical);
    expect(await ids(Book.order("name"))).toEqual(alphabetical);
    expect(await ids(Book.order("books.name"))).toEqual(alphabetical);
    expect(await ids(Book.order(Book.arelTable.get("name")))).toEqual(alphabetical);
    expect(await ids(Book.order({ books: { name: "asc" } }))).toEqual(alphabetical);
  });

  it("order desc", async () => {
    const z = (await Book.create({ name: "Zulu", author: authors("david") })) as any;
    const y = (await Book.create({ name: "Yankee", author: authors("mary") })) as any;
    const x = (await Book.create({ name: "X-Ray", author: authors("david") })) as any;

    const reverseAlphabetical = [z.id, y.id, x.id];

    expect(await ids(Book.order({ name: "desc" }))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order({ name: "DESC" }))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order({ name: "desc" }))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order("name").reverseOrder())).toEqual(reverseAlphabetical);
    expect(await ids(Book.order("name desc"))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order("books.name desc"))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order(Book.arelTable.get("name").desc()))).toEqual(reverseAlphabetical);
    expect(await ids(Book.order({ books: { name: "desc" } }))).toEqual(reverseAlphabetical);
  });

  it("order with association", async () => {
    const z = (await Book.create({ name: "Zulu", author: authors("david") })) as any;
    const y = (await Book.create({ name: "Yankee", author: authors("mary") })) as any;
    const x = (await Book.create({ name: "X-Ray", author: authors("david") })) as any;

    const authorThenBookName = [x.id, z.id, y.id];

    expect(await incOrder({ authors: { name: "asc" }, books: { name: "asc" } })).toEqual(
      authorThenBookName,
    );
    expect(await incOrder("authors.name", { books: { name: "asc" } })).toEqual(authorThenBookName);
    expect(await incOrder("authors.name", "books.name")).toEqual(authorThenBookName);
    expect(await incOrder({ authors: { name: "asc" } }, Book.arelTable.get("name"))).toEqual(
      authorThenBookName,
    );
    expect(await incOrder(Author.arelTable.get("name"), Book.arelTable.get("name"))).toEqual(
      authorThenBookName,
    );

    const authorDescThenBookName = [y.id, x.id, z.id];

    expect(await incOrder({ authors: { name: "desc" }, books: { name: "asc" } })).toEqual(
      authorDescThenBookName,
    );
    expect(await incOrder("authors.name desc", { books: { name: "asc" } })).toEqual(
      authorDescThenBookName,
    );
    expect(await incOrder(Author.arelTable.get("name").desc(), { books: { name: "asc" } })).toEqual(
      authorDescThenBookName,
    );
    expect(await incOrder({ authors: { name: "desc" } }, "name")).toEqual(authorDescThenBookName);
  });

  it("order with association alias", async () => {
    const z = (await Book.create({ name: "Zulu", author: authors("david") })) as any;
    const y = (await Book.create({ name: "Yankee", author: authors("mary") })) as any;
    const x = (await Book.create({ name: "X-Ray", author: authors("david") })) as any;

    const authorName = Author.arelTable.alias("author").get("name");

    const authorThenBookName = [x.id, z.id, y.id];

    expect(await incOrder({ author: { name: "asc" }, books: { name: "asc" } })).toEqual(
      authorThenBookName,
    );
    expect(await incOrder("author.name", { books: { name: "asc" } })).toEqual(authorThenBookName);
    expect(await incOrder({ author: { name: "asc" } }, "name")).toEqual(authorThenBookName);
    expect(await incOrder(authorName, "name")).toEqual(authorThenBookName);

    const authorDescThenBookName = [y.id, x.id, z.id];

    expect(await incOrder({ author: { name: "desc" }, books: { name: "asc" } })).toEqual(
      authorDescThenBookName,
    );
    expect(await incOrder("author.name desc", { books: { name: "asc" } })).toEqual(
      authorDescThenBookName,
    );
    expect(await incOrder({ author: { name: "desc" } }, "name")).toEqual(authorDescThenBookName);
    expect(await incOrder(authorName.desc(), "name")).toEqual(authorDescThenBookName);
  });
});
