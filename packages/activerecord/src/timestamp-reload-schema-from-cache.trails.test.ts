import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { Toy } from "./test-helpers/models/toy.js";
import { fixtures } from "./test-fixtures.js";
import * as Timestamp from "./timestamp.js";

describe("timestamp reload_schema_from_cache", () => {
  fixtures(["toys", "books"]);

  it("clears the memoized timestamp attributes", async () => {
    await Toy.first();

    expect(Timestamp.allTimestampAttributesInModel.call(Toy as never)).toEqual([
      "created_at",
      "updated_at",
    ]);
    const klass = Toy as unknown as Record<string, unknown>;
    expect(klass._allTimestampAttributesInModel).toBeDefined();
    expect(klass._timestampAttributesForCreateInModel).toBeDefined();
    expect(klass._timestampAttributesForUpdateInModel).toBeDefined();

    Toy.reloadSchemaFromCache();

    expect(klass._allTimestampAttributesInModel).toBeUndefined();
    expect(klass._timestampAttributesForCreateInModel).toBeUndefined();
    expect(klass._timestampAttributesForUpdateInModel).toBeUndefined();
  });

  it("re-consults a model's timestamp_attributes_for_update override", async () => {
    class BookWithoutUpdatedOn extends Base {
      static {
        this.tableName = "books";
      }

      static timestampAttributesForUpdate(): string[] {
        return ["updated_at"];
      }
    }

    for (const reset of [false, true]) {
      if (reset) BookWithoutUpdatedOn.resetColumnInformation();
      const book = (await BookWithoutUpdatedOn.first())!;
      const updatedOn = book.readAttribute("updated_on");
      book.writeAttribute("name", `renamed ${reset}`);
      await book.save();
      await book.reload();
      expect(book.readAttribute("updated_on")).toEqual(updatedOn);
      expect(book.readAttribute("updated_at")).not.toBeNull();
    }
    expect(
      Timestamp.timestampAttributesForUpdateInModel.call(BookWithoutUpdatedOn as never),
    ).toEqual(["updated_at"]);
  });
});
