import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base } from "../../index.js";
import type { AbstractAdapter } from "../abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";
import { assertNoQueries } from "../../testing/query-assertions.js";

describe("SchemaStatements#viewExists", () => {
  fixtures({});

  async function conn(): Promise<AbstractAdapter> {
    return (await Base.leaseConnection()) as unknown as AbstractAdapter;
  }

  const viewName = "view_exists_probe_books";

  beforeAll(async () => {
    await (
      await conn()
    ).executeMutation(
      `CREATE VIEW ${(await conn()).quoteTableName(viewName)} AS SELECT * FROM books`,
    );
  });

  afterAll(async () => {
    await (await conn()).executeMutation(`DROP VIEW ${(await conn()).quoteTableName(viewName)}`);
  });

  it("issues its probe as a SCHEMA query", async () => {
    await assertNoQueries(false, async () => {
      expect(await (await conn()).viewExists(viewName)).toBe(true);
      expect(await (await conn()).viewExists("no_such_view_anywhere")).toBe(false);
    });
  });

  it("treats a blank name as absent, like Rails' present? guard", async () => {
    expect(await (await conn()).viewExists("")).toBeNull();
    expect(await (await conn()).viewExists("   ")).toBeNull();
    expect(await (await conn()).viewExists(null as unknown as string)).toBeNull();
  });
});
