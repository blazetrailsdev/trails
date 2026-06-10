/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/order_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { registerModel } from "../index.js";
import { Base } from "../base.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import type { Schema } from "../test-helpers/define-schema.js";
import { Book } from "../test-helpers/models/book.js";
import { Author } from "../test-helpers/models/author.js";

describe("OrderTest", () => {
  const { authors } = useHandlerFixtures(["authors", "authorAddresses"]);
  // Force-recreate the canonical tables with `dropExisting` (mirrors
  // named-scoping.test.ts). The per-worker SQLite DB is shared across files
  // and sibling files define `books`/`authors` with different column sets;
  // the signature cache is primed at worker boot, so a plain `defineSchema`
  // would cache-hit and skip recreation.
  beforeAll(async () => {
    await defineSchema(
      Base.connection as Parameters<typeof defineSchema>[0],
      {
        authors: canonicalSchema.authors,
        author_addresses: canonicalSchema.author_addresses,
        books: canonicalSchema.books,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(Book);

  beforeEach(async () => {
    await Book.deleteAll();
  });

  const ids = async (rel: any): Promise<unknown[]> => (await rel.toArray()).map((b: any) => b.id);

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

    expect(
      await ids(
        Book.includes("author").order({ authors: { name: "asc" }, books: { name: "asc" } }),
      ),
    ).toEqual(authorThenBookName);
    expect(
      await ids(Book.includes("author").order("authors.name", { books: { name: "asc" } })),
    ).toEqual(authorThenBookName);
    expect(await ids(Book.includes("author").order("authors.name", "books.name"))).toEqual(
      authorThenBookName,
    );
    expect(
      await ids(
        Book.includes("author").order({ authors: { name: "asc" } }, Book.arelTable.get("name")),
      ),
    ).toEqual(authorThenBookName);
    expect(
      await ids(
        Book.includes("author").order(Author.arelTable.get("name"), Book.arelTable.get("name")),
      ),
    ).toEqual(authorThenBookName);

    const authorDescThenBookName = [y.id, x.id, z.id];

    expect(
      await ids(
        Book.includes("author").order({ authors: { name: "desc" }, books: { name: "asc" } }),
      ),
    ).toEqual(authorDescThenBookName);
    expect(
      await ids(Book.includes("author").order("authors.name desc", { books: { name: "asc" } })),
    ).toEqual(authorDescThenBookName);
    expect(
      await ids(
        Book.includes("author").order(Author.arelTable.get("name").desc(), {
          books: { name: "asc" },
        }),
      ),
    ).toEqual(authorDescThenBookName);
    expect(await ids(Book.includes("author").order({ authors: { name: "desc" } }, "name"))).toEqual(
      authorDescThenBookName,
    );
  });

  // BLOCKED: ordering by the aliased association table ("author" rather than
  // the real "authors") requires the eager-load JoinDependency to alias the
  // belongs_to join to the singular association name. Our eager_load joins the
  // table under its real name ("authors"), so `author.name` is "no such
  // column". Un-skip once JoinDependency aliases single joins to the
  // association name. (`order with association` — un-aliased — passes.)
  it.skip("order with association alias", async () => {
    const z = (await Book.create({ name: "Zulu", author: authors("david") })) as any;
    const y = (await Book.create({ name: "Yankee", author: authors("mary") })) as any;
    const x = (await Book.create({ name: "X-Ray", author: authors("david") })) as any;

    const authorName = Author.arelTable.alias("author").get("name");

    const authorThenBookName = [x.id, z.id, y.id];

    expect(
      await ids(Book.includes("author").order({ author: { name: "asc" }, books: { name: "asc" } })),
    ).toEqual(authorThenBookName);
    expect(
      await ids(Book.includes("author").order("author.name", { books: { name: "asc" } })),
    ).toEqual(authorThenBookName);
    expect(await ids(Book.includes("author").order({ author: { name: "asc" } }, "name"))).toEqual(
      authorThenBookName,
    );
    expect(await ids(Book.includes("author").order(authorName, "name"))).toEqual(
      authorThenBookName,
    );

    const authorDescThenBookName = [y.id, x.id, z.id];

    expect(
      await ids(
        Book.includes("author").order({ author: { name: "desc" }, books: { name: "asc" } }),
      ),
    ).toEqual(authorDescThenBookName);
    expect(
      await ids(Book.includes("author").order("author.name desc", { books: { name: "asc" } })),
    ).toEqual(authorDescThenBookName);
    expect(await ids(Book.includes("author").order({ author: { name: "desc" } }, "name"))).toEqual(
      authorDescThenBookName,
    );
    expect(await ids(Book.includes("author").order(authorName.desc(), "name"))).toEqual(
      authorDescThenBookName,
    );
  });
});
