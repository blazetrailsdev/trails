import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "../test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

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

beforeAll(async () => {
  await defineSchema({ authors: TEST_SCHEMA.authors });
  await StringTestAuthor.loadSchema();
});

const { authors } = useFixtures(
  {
    authors: [
      StringTestAuthor,
      {
        sean: { name: "Sean" },
      },
    ],
  },
  () => Base.connection,
);

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
