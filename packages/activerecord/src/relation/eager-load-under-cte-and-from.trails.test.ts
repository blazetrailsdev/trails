import { afterEach, it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { describeIfSupports } from "../support/supports.js";
import { Notifications } from "@blazetrails/activesupport";

describeIfSupports("common_table_expressions", "eager load under a CTE / FROM override", () => {
  fixtures(["posts", "comments"]);

  afterEach(() => Notifications.unsubscribeAll());

  it("emits the aliased eager JOIN alongside the CTE", async () => {
    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).eagerLoad(":comments");

    const sql = relation.toSql();
    expect(sql).toMatch(/WITH\s+/i);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("emits the aliased eager JOIN alongside a FROM override", async () => {
    const relation = Post.from("posts AS posts").eagerLoad(":comments");

    expect(relation.toSql()).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("renders the limited-ids subquery for an eager-loaded limited relation used as FROM", () => {
    const relation = Post.from(Post.eagerLoad(":comments").limit(2).order("posts.id"), "posts");

    const sql = relation.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).toMatch(/IN \(SELECT DISTINCT/i);
  });

  it("filters an eager-loaded limited FROM relation by its materialized ids when it runs", async () => {
    const from = Post.eagerLoad(":comments").limit(2).order("posts.id");
    const subquery = () => Post.from(from, "posts");
    type Subquery = ReturnType<typeof subquery>;
    const run: Record<string, (relation: Subquery) => Promise<unknown>> = {
      load: (relation) => relation.toArray(),
      count: (relation) => relation.count(),
      pluck: (relation) => relation.pluck("id"),
      ids: async (relation) => relation.ids(),
      exists: (relation) => relation.isExists(),
      first: (relation) => relation.first(),
    };
    for (const [name, query] of Object.entries(run)) {
      const relation = subquery();
      const sqls: string[] = [];
      const subscriber = Notifications.subscribe("sql.active_record", (...args: unknown[]) => {
        const event = args[args.length - 1] as { payload?: { sql: string }; sql?: string };
        sqls.push(String((event.payload ?? event).sql));
      });
      await query(relation);
      Notifications.unsubscribe(subscriber);
      expect(sqls[0], name).toMatch(/^SELECT DISTINCT/i);
      expect(sqls.at(-1), name).toMatch(/IN \(\d+, \d+\)/);
      expect(sqls.at(-1), name).not.toMatch(/IN \(SELECT/i);
      expect(relation.fromClause.value, name).toBe(from);
      expect(subquery().toSql(), name).toMatch(/IN \(SELECT DISTINCT/i);
      const other = Post.eagerLoad(":comments").limit(1);
      const swapped = relation.unscope(":from").from(other, "posts").toSql();
      expect(swapped, name).toMatch(/IN \(SELECT DISTINCT/i);
      expect(swapped, name).not.toMatch(/IN \(\d/);
      expect(relation.reset().toSql(), name).toMatch(/IN \(SELECT DISTINCT/i);
    }
    expect(new Set((await subquery()).map((post) => post.id)).size).toBe(2);
  });

  it("skips the limited-ids subquery for a grouped eager-loaded FROM relation", () => {
    const from = Post.eagerLoad(":comments").group("posts.id").limit(2);

    const sql = Post.from(from, "posts").toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).not.toMatch(/SELECT DISTINCT/i);
  });
});
