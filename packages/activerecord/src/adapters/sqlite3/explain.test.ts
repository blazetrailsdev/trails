/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/explain_test.rb
 */
import { it, expect } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "./test-helper.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Author } from "../../test-helpers/models/author.js";
import "../../test-helpers/models/post.js";

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

  it.skip("explain with eager loading", () => {
    // BLOCKED: adapter-sqlite — SQLite-specific adapter gap in explain
    // ROOT-CAUSE: adapters/sqlite3/explain.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in adapters/sqlite3/explain.ts; affects ~1–17 tests in explain.test.ts
  });
});
