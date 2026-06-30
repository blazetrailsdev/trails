import { describe, it, expect } from "vitest";
import { Author } from "../test-helpers/models/author.js";
import { fixtures } from "../test-helpers/fixtures.js";

// Rails' Class.new(Base) { self.table_name = "authors" } generates
// name_changed? via attribute_method_suffix. Schema-reflected attributes
// don't call defineDirtyAttributeMethods, so we declare name explicitly
// to get the nameChanged() dynamic method the Rails test exercises.
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
    expect(author.changed).toBe(false);

    // JS strings are immutable; assignment goes through the setter rather than mutating in place.
    // nameChanged() fires via dirty-tracker change detection, not isChangedInPlace.
    author.name = String(author.name) + " Griffin";
    expect((author as any).nameChanged()).toBe(true);

    await author.save();
    await author.reload();

    expect(author.name).toBe("Sean Griffin");
    expect(author.changed).toBe(false);
  });
});
