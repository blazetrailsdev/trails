/**
 * TS-only coverage for `Relation#_substitute_values`
 * (relation.rb:1381-1393): update_all values are cast by the column type and
 * bound, never inline-quoted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-helpers/fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { initializeAssociations } from "../associations.js";

beforeAll(async () => {
  await initializeAssociations();
});

type Mutator = (sql: string, ...rest: unknown[]) => unknown;

/** Runs `fn`, capturing the SQL + binds of every UPDATE issued on `rel`'s connection. */
async function captureUpdate(
  rel: unknown,
  fn: () => Promise<unknown>,
): Promise<{ sql: string; binds: unknown[] }> {
  const conn = (rel as { _conn(): Record<string, Mutator> })._conn();
  const key = conn.executeMutation ? "executeMutation" : "execute";
  const original = conn[key];
  const calls: { sql: string; binds: unknown[] }[] = [];
  conn[key] = function (sql: string, ...rest: unknown[]) {
    calls.push({ sql, binds: (rest[0] as unknown[]) ?? [] });
    return original.call(this, sql, ...rest);
  };
  try {
    await fn();
  } finally {
    conn[key] = original;
  }
  const update = calls.find((c) => c.sql.startsWith("UPDATE"));
  if (!update) throw new Error(`no UPDATE captured; saw: ${calls.map((c) => c.sql).join(" | ")}`);
  return update;
}

describe("update_all value substitution", () => {
  fixtures({ topics: [Topic, {}] });

  it("casts a wrong-typed value through the column type", async () => {
    const rel = Topic.where({ id: 1 });
    // A raw ISO-8601 string is not a datetime — `type_for_attribute("written_on").cast`
    // must turn it into a Time, which then serializes to Rails' datetime format.
    const { sql, binds } = await captureUpdate(rel, () =>
      rel.updateAll({ written_on: "2004-04-15T10:20:30Z" }),
    );

    expect(sql).not.toContain("2004-04-15T10:20:30Z");
    expect(binds[0]).toBeInstanceOf(Temporal.Instant);
    expect((binds[0] as Temporal.Instant).toString()).toBe("2004-04-15T10:20:30Z");
  });

  it("sends values as bind params rather than inline literals", async () => {
    const rel = Topic.where({ id: 1 });
    const { sql, binds } = await captureUpdate(rel, () => rel.updateAll({ title: "bound value" }));

    expect(sql).not.toContain("'bound value'");
    expect(binds[0]).toBe("bound value");
  });

  it("passes Arel nodes through, wrapping SqlLiteral in a Grouping", async () => {
    const rel = Topic.where({ id: 1 });
    const { sql } = await captureUpdate(rel, () =>
      rel.updateAll({ title: new Nodes.SqlLiteral("UPPER(title)") }),
    );

    expect(sql).toContain("(UPPER(title))");
  });
});
