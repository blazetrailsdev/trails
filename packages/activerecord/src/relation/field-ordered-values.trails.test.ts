/**
 * Trails-only coverage for `in_order_of`, alongside the Rails mirror in
 * field-ordered-values.test.ts.
 *
 * Mirrors: activerecord/test/cases/relation/field_ordered_values_test.rb
 */
import { describe, it, expect } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Book } from "../test-helpers/models/book.js";
import { Author } from "../test-helpers/models/author.js";

describe("FieldOrderedValuesTest (trails)", () => {
  fixtures([]);
  registerModel(Author);
  registerModel(Book);

  // Rails' `Arel::Nodes::SqlLiteral < String`, so `type_cast_for_database` reaches
  // the real column type through `name.to_s` (attribute_registration.rb:102) even
  // when the column arrives as an Arel literal — an enum's labels still serialize
  // to their stored integers. Without `SqlLiteral#toString` the name stringifies
  // to "[object Object]", silently falling through to a no-op ValueType cast and
  // ordering by the raw labels.
  it("in order of with enums values through an arel literal column", async () => {
    await Book.destroyAll();
    await Book.create({ status: "proposed" });
    await Book.create({ status: "written" });
    await Book.create({ status: "published" });

    const order = ["written", "published", "proposed"];
    const books = Book.inOrderOf(arelSql("status"), order);

    expect((await books).map((b) => b.status)).toEqual(order);
  });
});
