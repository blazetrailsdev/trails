/**
 * trails-only regression coverage for the SchemaStatements reflection probes.
 *
 * Rails issues every read-only reflection query through
 * `internal_exec_query(sql, "SCHEMA")`, so the payload
 * is named "SCHEMA" and query counting skips it. trails probed several of them
 * through `execute`, which names the query "SQL" and inflated `assertQueries`
 * counts in any suite that straddled a reflection read.
 *
 * The concrete adapters override most of these, so the probes are exercised by
 * layering just the abstract bodies over the live connection — that is the code
 * path the abstract bodies actually own, while everything they delegate to
 * (`dataSourceSql`, `internalExecQuery`) still resolves on the real adapter.
 *
 * `columns` and `primaryKey` are not layered: the abstract bodies
 * (schema_statements.rb:107-113, :145-149) issue no query of their own, they
 * only map `column_definitions` through `new_column_from_field` and read
 * `primary_keys` — all per-adapter overrides — so the SCHEMA naming they must
 * carry is the adapters' and is asserted through them.
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
    const host = Object.create(conn()) as SchemaStatements;
    const proto = Object.getOwnPropertyDescriptors(SchemaStatements.prototype);
    for (const name of ["tables", "views", "dataSources", "dataSourceExists"] as const) {
      Object.defineProperty(host, name, proto[name]);
    }
    return host;
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
