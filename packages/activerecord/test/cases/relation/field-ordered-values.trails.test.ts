import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Book } from "../../models/book.js";
import { Author } from "../../models/author.js";

describe("FieldOrderedValuesTest (trails)", () => {
  fixtures([]);
  constSet(TopLevel, "Author", Author);
  constSet(TopLevel, "Book", Book);

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
