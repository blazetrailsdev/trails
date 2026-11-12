import { describe, it, expect } from "vitest";
import { Base } from "../../lib/index.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";

describe("TestColumnAlias", () => {
  fixtures(["topics"]);

  it("column alias", async () => {
    const records = await (await Base.leaseConnection()).selectAll("SELECT id AS pk FROM topics");
    expect(records.columns).toEqual(["pk"]);
  });
});
