import { describe, it, expect } from "vitest";
import { assertPredicate, assertNotPredicate } from "@blazetrails/activesupport";
import { Author } from "../test-helpers/models/author.js";
import { fixtures } from "../test-fixtures.js";

class StringTestAuthor extends Author {
  static override _tableName = "authors";
  static {
    this.attribute("name", "string");
  }
}

const { authors } = fixtures({
  authors: [
    StringTestAuthor,
    {
      sean: { name: "Sean" },
    },
  ],
});

describe("StringTypeTest", () => {
  it("string mutations are detected", async () => {
    const author = await StringTestAuthor.find(authors("sean").id);
    assertNotPredicate(author, (a) => a.isChanged);

    author.name = String(author.name) + " Griffin";
    assertPredicate(author, (a) => (a as any).nameChanged());

    await author.save();
    await author.reload();

    expect(author.name).toEqual("Sean Griffin");
    assertNotPredicate(author, (a) => a.isChanged);
  });
});
