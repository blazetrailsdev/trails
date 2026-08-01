/**
 * trails-only regression coverage for SchemaStatements#viewExists.
 *
 * Rails runs the probe as `query_values(data_source_sql(...), "SCHEMA")`, so
 * the query is named "SCHEMA" and query counting skips it. trails previously
 * probed through `execute`, which names the query "SQL" and inflated
 * `assertQueries` counts in any suite that straddled a view-existence check.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base } from "../../index.js";
import type { AbstractAdapter } from "../abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";
import { assertNoQueries } from "../../testing/query-assertions.js";

describe("SchemaStatements#viewExists", () => {
  fixtures({});

  function conn(): AbstractAdapter {
    return Base.connection as unknown as AbstractAdapter;
  }

  const viewName = "view_exists_probe_books";

  beforeAll(async () => {
    await conn().executeMutation(
      `CREATE VIEW ${conn().quoteTableName(viewName)} AS SELECT * FROM books`,
    );
  });

  afterAll(async () => {
    await conn().executeMutation(`DROP VIEW ${conn().quoteTableName(viewName)}`);
  });

  it("issues its probe as a SCHEMA query", async () => {
    await assertNoQueries(false, async () => {
      expect(await conn().viewExists(viewName)).toBe(true);
      expect(await conn().viewExists("no_such_view_anywhere")).toBe(false);
    });
  });

  it("treats a blank name as absent, like Rails' present? guard", async () => {
    expect(await conn().viewExists("")).toBe(false);
    expect(await conn().viewExists("   ")).toBe(false);
    expect(await conn().viewExists(null as unknown as string)).toBe(false);
  });
});
