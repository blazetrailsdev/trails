/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/explain_test.rb
 */
import { it, expect } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "./test-helper.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Author } from "../../test-helpers/models/author.js";
// Opt into the canonical-model autoload index so `Author.has_many :posts`
// resolves `Post` by name on first reference.
import "../../support/canonical-model-index.js";

// -- Rails test class: explain_test.rb (ActiveRecord::SQLite3TestCase) --
// Pinned to the SQLite backend: the `EXPLAIN for: … "authors" …` header quoting
// and the `SEARCH … authors USING … PRIMARY KEY` plan shape are SQLite-specific,
// so this must skip when the handler connection is PG/MySQL in the CI matrix.
describeIfSqlite("SQLite3ExplainTest", () => {
  // Rails `fixtures :authors, :author_addresses`. The canonical tables come
  // from the template clone.
  const { authors } = fixtures(["authors", "authorAddresses"]);

  it("explain for one query", async () => {
    const explain = await Author.where({ id: authors("david").id }).explain();
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\? \[\["id", 1\]\]|\? \[1\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH )?(TABLE )?authors USING (INTEGER )?PRIMARY KEY/);
  });

  it("explain with eager loading", async () => {
    const explain = await Author.where({ id: authors("david").id })
      .includes("posts")
      .explain();
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\? \[\["id", 1\]\]|\? \[1\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH )?(TABLE )?authors USING (INTEGER )?PRIMARY KEY/);
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "posts"\.\* FROM "posts" WHERE "posts"\."author_id" = (?:\? \[\["author_id", 1\]\]|\? \[1\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH |(SCAN )?(TABLE ))posts/);
  });
});
