/**
 * Mirrors: activerecord/test/cases/relations_test.rb
 *
 * Covers Rails `Relation#exec_main_query`, which short-circuits a
 * contradictory where-clause (e.g. `where(id: [])`, an empty `IN`) to a
 * frozen `[]` *before* issuing any SQL. Test names match the Rails methods
 * verbatim.
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { registerModel } from "./associations.js";
import { Author } from "./test-helpers/models/author.js";

registerModel(Author);

describe("RelationTest", () => {
  useHandlerFixtures(["authors", "authorAddresses"], { schema: canonicalSchema });

  it("find in empty array", async () => {
    const authors = Author.all().where({ id: [] });
    expect(await authors.toArray()).toEqual([]);
  });

  it("contradiction where-clause issues no query", async () => {
    // Rails `exec_main_query` returns `[].freeze` for a contradiction without
    // touching the database — no SELECT is sent.
    await assertNoQueries(false, async () => {
      expect(await Author.all().where({ id: [] }).toArray()).toEqual([]);
    });
  });
});
