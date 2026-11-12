import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../../../../lib/index.js";
import type { AbstractAdapter } from "../../../../lib/connection-adapters/abstract-adapter.js";
import { fixtures } from "../../../support/use-fixtures.js";
import { assertNoQueries } from "../../../../lib/testing/query-assertions.js";
import { SchemaStatements } from "../../../../lib/connection-adapters/abstract/schema-statements.js";

describe("SchemaStatements reflection probes", () => {
  fixtures({});

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as unknown as AbstractAdapter;
  });

  function statements(): SchemaStatements {
    const host = Object.create(connection) as SchemaStatements;
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
