import { describe, it, expect } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Post } from "../test-helpers/models/post.js";
import { Topic } from "../test-helpers/models/topic.js";

type Mutator = (sql: string, ...rest: unknown[]) => unknown;

async function captureUpdate(
  rel: unknown,
  fn: () => Promise<unknown>,
): Promise<{ sql: string; binds: unknown[] }> {
  const conn = (rel as { _conn(): Record<string, Mutator> })._conn();
  const key = conn.internalExecute ? "internalExecute" : "execute";
  const original = conn[key];
  const calls: { sql: string; binds: unknown[] }[] = [];
  conn[key] = function (sql: string, ...rest: unknown[]) {
    calls.push({ sql, binds: (rest[1] as unknown[]) ?? [] });
    return original.call(this, sql, ...rest);
  };
  try {
    await fn();
  } finally {
    conn[key] = original;
  }
  const update = calls.find((c) => c.sql.startsWith("UPDATE"));
  if (!update) throw new Error(`no UPDATE captured; saw: ${calls.map((c) => c.sql).join(" | ")}`);
  return {
    sql: update.sql,
    binds: update.binds.map((b) =>
      b !== null && typeof b === "object" && "valueForDatabase" in b
        ? (b as { valueForDatabase: unknown }).valueForDatabase
        : b,
    ),
  };
}

describe("update_all value substitution", () => {
  fixtures({ topics: [Topic, {}] });

  it("casts a wrong-typed value through the column type", async (ctx) => {
    ctx.skip(!(await Topic.leaseConnection()).preparedStatements);
    const rel = Topic.where({ id: 1 });
    const { sql, binds } = await captureUpdate(rel, () =>
      rel.updateAll({ written_on: "2004-04-15T10:20:30Z" }),
    );

    expect(sql).not.toContain("2004-04-15T10:20:30Z");
    expect(binds[0]).toBeInstanceOf(RubyTime);
    expect((binds[0] as RubyTime).getutc().xmlschema()).toBe("2004-04-15T10:20:30Z");
  });

  it("sends values as bind params rather than inline literals", async (ctx) => {
    ctx.skip(!(await Topic.leaseConnection()).preparedStatements);
    const rel = Topic.where({ id: 1 });
    const { sql, binds } = await captureUpdate(rel, () => rel.updateAll({ title: "bound value" }));

    expect(sql).not.toContain("'bound value'");
    expect(binds[0]).toBe("bound value");
  });

  it("casts each value exactly once", async (ctx) => {
    ctx.skip(!(await Topic.leaseConnection()).preparedStatements);
    const casts: unknown[] = [];
    const stub = {
      cast: (v: unknown) => {
        casts.push(v);
        return `cast(${String(v)})`;
      },
      serialize: (v: unknown) => v,
    };
    const model = Topic as unknown as { typeForAttribute(n: string): unknown };
    const real = model.typeForAttribute;
    model.typeForAttribute = function (name: string) {
      return name === "title" ? stub : real.call(this, name);
    };

    const rel = Topic.where({ id: 1 });
    try {
      const { binds } = await captureUpdate(rel, () => rel.updateAll({ title: "x" }));
      expect(casts).toEqual(["x"]);
      expect(binds[0]).toBe("cast(x)");
    } finally {
      model.typeForAttribute = real;
    }
  });

  it("passes Arel nodes through, wrapping SqlLiteral in a Grouping", async () => {
    const rel = Topic.where({ id: 1 });
    const { sql } = await captureUpdate(rel, () =>
      rel.updateAll({ title: new Nodes.SqlLiteral("UPPER(title)") }),
    );

    expect(sql).toContain("(UPPER(title))");
  });
});

describe("touch_all / update_counters with empty updates", () => {
  const { topics } = fixtures(["posts", "topics"]);

  it("touch_all raises when the model has no timestamp columns", async () => {
    await expect(Post.all().touchAll()).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("touch_all raises on a none relation, since the blank check precedes none?", async () => {
    await expect(Post.none().touchAll()).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_counters raises on an empty counters hash", async () => {
    await expect(Post.all().updateCounters({})).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_counters raises on a none relation with an empty counters hash", async () => {
    await expect(Post.none().updateCounters({})).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_all with a whitespace-only string argument raises", async () => {
    await expect(Post.all().updateAll("  ")).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_counters with touch: [] raises when there are no timestamp columns", async () => {
    await expect(Post.all().updateCounters({ touch: [] })).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_counters still updates when only the touch option contributes columns", async () => {
    const first = topics("first");
    const before = await Topic.find(first.id);
    const count = await Topic.where({ id: first.id }).updateCounters({ touch: true });

    expect(count).toBe(1);
    const after = await Topic.find(first.id);
    expect(after.readAttribute("updated_at")).not.toEqual(before.readAttribute("updated_at"));
  });
});
