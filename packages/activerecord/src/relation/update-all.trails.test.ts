/**
 * TS-only coverage for `Relation#_substitute_values`
 * (relation.rb:1381-1393): update_all values are cast by the column type and
 * bound, never inline-quoted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { initializeAssociations } from "../associations.js";

beforeAll(async () => {
  await initializeAssociations();
});

describe("update_all value substitution", () => {
  fixtures({ topics: [Topic, {}] });

  it("casts a wrong-typed value through the column type", async () => {
    const created = await Topic.create({ title: "cast me" });
    await Topic.where({ id: (created as unknown as { id: number }).id }).updateAll({
      written_on: "2004-04-15T10:20:30Z",
    });

    const topic = await Topic.find((created as unknown as { id: number }).id);
    const writtenOn = (topic as unknown as Record<string, unknown>).written_on;
    expect(typeof writtenOn).not.toBe("string");
    expect(String(writtenOn)).toContain("2004-04-15");
  });

  it("sends values as bind params rather than inline literals", async () => {
    const rel = Topic.where({ id: 1 });
    const sqls: string[] = [];
    const conn = (
      rel as unknown as { _conn(): Record<string, (sql: string, ...rest: unknown[]) => unknown> }
    )._conn();
    const original = conn.executeMutation ?? conn.execute;
    const key = conn.executeMutation ? "executeMutation" : "execute";
    conn[key] = function (sql: string, ...rest: unknown[]) {
      sqls.push(sql);
      return original.call(this, sql, ...rest);
    };
    try {
      await rel.updateAll({ title: "bound value" });
    } finally {
      conn[key] = original;
    }

    const update = sqls.find((s) => s.startsWith("UPDATE"));
    expect(update).toBeDefined();
    expect(update).not.toContain("'bound value'");
  });
});
