import { it, expect } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { fixtures } from "../../test-fixtures.js";
import { Author } from "../../test-helpers/models/author.js";
import "../../support/canonical-model-index.js";

describeIfSqlite("SQLite3ExplainTest", () => {
  const { authors } = fixtures(["authors", "authorAddresses"]);

  it("explain for one query", async () => {
    const explain = await Author.where({ id: authors("david").id }).explain();
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\? \[\["id", 1\]\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH )?(TABLE )?authors USING (INTEGER )?PRIMARY KEY/);
  });

  it("explain with eager loading", async () => {
    const explain = await Author.where({ id: authors("david").id })
      .includes(":posts")
      .explain();
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\? \[\["id", 1\]\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH )?(TABLE )?authors USING (INTEGER )?PRIMARY KEY/);
    expect(explain).toMatch(
      /EXPLAIN for: SELECT "posts"\.\* FROM "posts" WHERE "posts"\."author_id" = (?:\? \[\["author_id", 1\]\]|1)/,
    );
    expect(explain).toMatch(/(SEARCH |(SCAN )?(TABLE ))posts/);
  });
});
