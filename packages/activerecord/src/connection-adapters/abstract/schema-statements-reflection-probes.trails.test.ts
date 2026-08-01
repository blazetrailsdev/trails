/**
 * trails-only regression coverage for the SchemaStatements reflection probes.
 *
 * Rails issues every read-only reflection query through
 * `internal_exec_query(sql, "SCHEMA")` (trails' `schemaQuery`), so the payload
 * is named "SCHEMA" and query counting skips it. trails probed several of them
 * through `execute`, which names the query "SQL" and inflated `assertQueries`
 * counts in any suite that straddled a reflection read.
 *
 * The concrete adapters override most of these, so the probes are exercised
 * against a bare `SchemaStatements` bound to the live connection — that is the
 * code path the abstract bodies actually own.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../../index.js";
import type { AbstractAdapter } from "../abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";
import { assertNoQueries } from "../../testing/query-assertions.js";
import { SchemaStatements } from "./schema-statements.js";

describe("SchemaStatements reflection probes", () => {
  fixtures({});

  function conn(): AbstractAdapter {
    return Base.connection as unknown as AbstractAdapter;
  }

  function statements(): SchemaStatements {
    return new SchemaStatements(conn() as never);
  }

  it("issues tables and views as SCHEMA queries", async () => {
    await assertNoQueries(false, async () => {
      expect(await statements().tables()).toContain("books");
      expect(await statements().views()).not.toContain("books");
    });
  });

  it("issues dataSourceExists as a SCHEMA query", async () => {
    await assertNoQueries(false, async () => {
      expect(await statements().dataSourceExists("books")).toBe(true);
      expect(await statements().dataSourceExists("no_such_table_anywhere")).toBe(false);
    });
  });

  it("issues columns and primaryKey as SCHEMA queries", async () => {
    await assertNoQueries(false, async () => {
      const columns = await statements().columns("books");
      expect(columns.map((column) => column.name)).toContain("name");
      expect(await statements().primaryKey("books")).toBe("id");
    });
  });
});
