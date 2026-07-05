import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("TestColumnAlias", () => {
  fixtures(["topics"]);

  it("column alias", async () => {
    const records = await Base.connection.selectAll("SELECT id AS pk FROM topics");
    expect(records.columns).toEqual(["pk"]);
  });
});
