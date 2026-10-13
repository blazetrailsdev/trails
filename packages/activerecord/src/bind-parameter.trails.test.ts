import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("BindParameterTrailsTest", () => {
  fixtures(["topics"]);

  it("materializes a record load whose IN exceeds the bind-params cap", async () => {
    const conn = await Topic.leaseConnection();
    const ids = Array.from({ length: conn.bindParamsLength() + 1 }, (_, i) => i + 1);
    const topics = await Topic.where({ id: ids });
    expect(topics.length).toBe(await Topic.count());
  });
});
