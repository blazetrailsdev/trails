import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "./test-fixtures.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { registerModel } from "./associations.js";
import { Author } from "./test-helpers/models/author.js";

registerModel(Author);

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
      expect(await Author.all().where({ id: [] }).exists()).toBe(false);
    });
  });
});
