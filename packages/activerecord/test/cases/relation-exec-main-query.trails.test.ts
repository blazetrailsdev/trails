import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import "../../lib/index.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";
import { assertNoQueries } from "../../lib/testing/query-assertions.js";
import { Author } from "../models/author.js";

constSet(TopLevel, "Author", Author);

describe("RelationTest", () => {
  fixtures(["authors", "authorAddresses"]);

  it("find in empty array", async () => {
    const authors = Author.all().where({ id: [] });
    expect(await authors).toEqual([]);
  });

  it("contradiction where-clause issues no query", async () => {
    await assertNoQueries(false, async () => {
      expect(await Author.all().where({ id: [] })).toEqual([]);
    });
  });

  it("count on contradiction where-clause issues no query", async () => {
    await assertNoQueries(false, async () => {
      expect(await Author.all().where({ id: [] }).count()).toEqual(0);
    });
  });

  it("pluck on contradiction where-clause issues no query", async () => {
    await assertNoQueries(false, async () => {
      expect(await Author.all().where({ id: [] }).pluck("id")).toEqual([]);
    });
  });

  it("exists on contradiction where-clause issues no query", async () => {
    await assertNoQueries(false, async () => {
      expect(await Author.all().where({ id: [] }).isExists()).toBe(false);
    });
  });
});
