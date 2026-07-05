import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("TestColumnAlias", () => {
  fixtures({}, { useTransactionalTests: false });
  beforeAll(async () => {
    await (Base.connection as any).executeMutation("INSERT INTO topics (title) VALUES ('a')");
  });

  it("column alias", async () => {
    const records = await Base.connection.selectAll("SELECT id AS pk FROM topics");
    expect(records.columns).toEqual(["pk"]);
  });
});
