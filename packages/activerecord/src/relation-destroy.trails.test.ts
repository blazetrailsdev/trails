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

  it("branches on the relation itself, not only through the model delegate", async () => {
    const topics = await Topic.limit(2).order("id");
    const ids = topics.map((topic) => topic.id);
    const topicsBefore = (await Topic.count()) as number;

    const destroyedTopics = (await Topic.all().destroy(ids)) as Topic[];

    expect((await Topic.count()) as number).toBe(topicsBefore - 2);
    expect(destroyedTopics.map((record) => record.id).sort()).toEqual([...ids].sort());

    const book = cpkBooks("cpk_great_author_first_book");
    const booksBefore = (await CpkBook.count()) as number;

    const destroyedBook = (await CpkBook.all().destroy(book.id)) as CpkBook;

    expect((await CpkBook.count()) as number).toBe(booksBefore - 1);
    expect(destroyedBook.id).toEqual(book.id);
  });
});
