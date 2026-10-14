import { describe, it, expect } from "vitest";
import { Person } from "../test-helpers/models/person.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

describe("JoinAssociation#join_constraints references_values", () => {
  const { self } = fixtures(["people", "readers", "posts", "comments"]);

  it("joins an association scope that references and includes another association", async () => {
    const sql = await Person.joins(":postsWithNoComments").toSql();

    expect(sql).toMatch(
      new RegExp(`LEFT OUTER JOIN\\s+${regexpEscape(self().quoteTableName("comments"))}`, "i"),
    );
    expect(sql).toMatch(/comments\.id is null/i);
  });
});
