/**
 * TS-only coverage for `Relation#_substitute_values`
 * (relation.rb:1381-1393): update_all values are cast by the column type and
 * bound, never inline-quoted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Post } from "../test-helpers/models/post.js";
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

  it("casts each value exactly once", async () => {
    // Rails casts once (relation.rb:1389-1390 + identity QueryAttribute#type_cast,
    // query_attribute.rb:22-24). A non-idempotent type makes a second cast visible.
    // A stub type whose `serialize` does NOT re-enter `cast` — every real type
    // self-casts inside serialize, which would mask the bind-level double cast.
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
      // Cast exactly once, on the RAW value — the bind must preserve the result
      // rather than casting it a second time.
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

/**
 * TS-only coverage for the empty-updates path of `touch_all` / `update_counters`
 * (relation.rb:926-944, 969-971). Neither method guards a blank hash: both hand
 * it to `update_all`, whose first line raises `ArgumentError` (relation.rb:589)
 * — before the `none?` check on the next line, so a `none` relation raises too.
 *
 * `posts` has no `updated_at`/`updated_on`, so `touch_attributes_with_time`
 * returns `{}` for `Post`.
 */
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

  it("update_counters with touch: [] raises when there are no timestamp columns", async () => {
    // `touch: []` is truthy in Ruby too, so Rails calls
    // touch_attributes_with_time with no names; on a model without
    // updated_at/updated_on that yields {} and update_all raises.
    await expect(Post.all().updateCounters({}, { touch: [] })).rejects.toThrow(
      new ArgumentError("Empty list of attributes to change"),
    );
  });

  it("update_counters still updates when only the touch option contributes columns", async () => {
    const first = topics("first");
    const before = await Topic.find(first.id);
    const count = await Topic.where({ id: first.id }).updateCounters({}, { touch: true });

    expect(count).toBe(1);
    const after = await Topic.find(first.id);
    expect(after.readAttribute("updated_at")).not.toEqual(before.readAttribute("updated_at"));
  });
});
