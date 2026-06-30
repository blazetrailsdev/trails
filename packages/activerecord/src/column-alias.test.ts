import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

describe("TestColumnAlias", () => {
  setupFixtures();
  beforeAll(async () => {
    await defineSchema({ topics: TEST_SCHEMA.topics });
    await (Base.connection as any).executeMutation("INSERT INTO topics (title) VALUES ('a')");
  });

  it("column alias", async () => {
    const records = await Base.connection.selectAll("SELECT id AS pk FROM topics");
    expect(records.columns).toEqual(["pk"]);
  });
});
