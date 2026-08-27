import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("where value defer-to-bind casting", () => {
  const { topics } = fixtures(["topics"]);

  it("whereNot with an un-castable string binds it instead of IS NOT NULL", async () => {
    const first = topics("first");
    await first.update({ parent_id: 0 });
    const rel = Topic.where().not({ parent_id: "not-a-number" });
    expect(rel.toSql()).not.toMatch(/IS NOT NULL/i);
    expect(await rel).toHaveLength(0);
  });

  it("or with an un-castable string binds it instead of IS NULL", async () => {
    const rel = Topic.where({ parent_id: "not-a-number" }).or(Topic.where({ written_on: "" }));
    expect(rel.toSql()).not.toMatch(/IS NULL/i);
    expect(await rel).toHaveLength(0);
  });

  it("having with an un-castable string binds it instead of IS NULL", async () => {
    const rel = Topic.select("parent_id").group("parent_id").having({ parent_id: "not-a-number" });
    expect(rel.toSql()).not.toMatch(/IS NULL/i);
    expect(await rel).toHaveLength(0);
  });

  it("non-string scalars for a numeric column take the same bind path as strings", async () => {
    const numeric = Topic.where({ parent_id: 1 }).toSql();
    const stringy = Topic.where({ parent_id: "1" }).toSql();
    expect(stringy).toBe(numeric);
  });
});
