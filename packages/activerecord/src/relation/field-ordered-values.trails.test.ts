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
