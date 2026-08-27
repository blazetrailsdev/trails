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
