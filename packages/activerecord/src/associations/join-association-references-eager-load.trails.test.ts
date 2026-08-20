/**
 * `JoinAssociation#join_constraints` builds a nested join dependency for an
 * association scope that both `references` and eager-loads
 * (`join_association.rb:45-55`):
 *
 *   unless scope.references_values.empty?
 *     associations = scope.eager_load_values | scope.includes_values
 *     unless associations.empty?
 *       scope.joins! scope.construct_join_dependency(associations, Arel::Nodes::OuterJoin)
 *     end
 *   end
 *
 * Person's canonical `posts_with_no_comments` (`test/models/person.rb:10`) is
 * exactly that shape — `includes(:comments).where("comments.id is null")
 * .references(:comments)` — so joining it has to emit the nested
 * `LEFT OUTER JOIN comments` its WHERE names. Without the block the emitted
 * SQL constrains `comments.id` with no `comments` in the FROM list.
 */
import { describe, it, expect } from "vitest";
import { Person } from "../test-helpers/models/person.js";
import { fixtures } from "../test-fixtures.js";
import { quoteTableName, escapeRegExp } from "../support/quote-regex.js";

describe("JoinAssociation#join_constraints references_values", () => {
  fixtures(["people", "readers", "posts", "comments"]);

  it("joins an association scope that references and includes another association", async () => {
    const sql = await Person.joins(":postsWithNoComments").toSql();

    expect(sql).toMatch(
      new RegExp(`LEFT OUTER JOIN\\s+${escapeRegExp(quoteTableName("comments"))}`, "i"),
    );
    expect(sql).toMatch(/comments\.id is null/i);
  });
});
