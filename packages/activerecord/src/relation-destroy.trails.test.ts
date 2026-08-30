import { describe, it, expect } from "vitest";
import { Topic } from "./test-helpers/models/topic.js";
import { CpkBook, CpkOrder, CpkAuthor } from "./test-helpers/models/cpk.js";
import { registerModel } from "./associations.js";
import { fixtures } from "./test-fixtures.js";

for (const klass of [Topic, CpkBook, CpkOrder, CpkAuthor]) {
  registerModel(klass);
}

describe("RelationDestroyTrailsTest", () => {
  const { cpkBooks } = fixtures(["topics", "cpkAuthors", "cpkBooks"]);

  it("destroys each record for multiple ids", async () => {
    const posts = await Topic.limit(2).order("id");
    const ids = posts.map((post) => post.id);
    const before = (await Topic.count()) as number;

    const destroyed = (await Topic.all().destroy(ids)) as Topic[];

    expect((await Topic.count()) as number).toBe(before - 2);
    expect(destroyed.map((record) => record.id).sort()).toEqual([...ids].sort());
  });

  it("treats a composite primary key as one id", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const before = (await CpkBook.count()) as number;

    const destroyed = (await CpkBook.all().destroy(book.id)) as CpkBook;

    expect((await CpkBook.count()) as number).toBe(before - 1);
    expect(destroyed.id).toEqual(book.id);
  });

  it("destroys each record for multiple composite primary keys", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const before = (await CpkBook.count()) as number;

    const destroyed = (await CpkBook.all().destroy(books.map((book) => book.id))) as CpkBook[];

    expect((await CpkBook.count()) as number).toBe(before - 2);
    expect(destroyed.map((record) => record.id).sort()).toEqual(
      books.map((book) => book.id).sort(),
    );
  });
});
