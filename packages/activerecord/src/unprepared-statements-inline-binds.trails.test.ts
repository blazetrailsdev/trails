/**
 * Trails-only: no Rails counterpart. Rails' `to_sql_and_binds`
 * (activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:31-45)
 * picks its collector from `prepared_statements`: with the flag off it compiles
 * through `SubstituteBinds` (`abstract_adapter.rb#collector`), so every value
 * inlines during traversal and `binds` comes back empty.
 *
 * Rails cannot regress this — the collector choice *is* the branch. trails
 * compiles through a `Composite` collector on every path, so the flag has to be
 * consulted explicitly at each compile site; this pins that it is.
 */
import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Nodes } from "@blazetrails/arel";

describe("unprepared statements inline binds", () => {
  fixtures(["topics"]);

  it("inlines a multi-value IN with no binds", async () => {
    const conn = (await Topic.leaseConnection()) as unknown as {
      unpreparedStatement(fn: () => Promise<void>): Promise<void>;
    };
    const events: Event[] = [];
    const subscriber = Notifications.subscribe("sql.active_record", (event: Event) => {
      if (String(event.payload["name"] ?? "") !== "SCHEMA") events.push(event);
    });
    try {
      await conn.unpreparedStatement(async () => {
        // A multi-value `IN` builds an `Arel::Nodes::HomogeneousIn`, which
        // carries real binds under the prepared collector — so an unprepared
        // compile that still parameterized would be visible here.
        await Topic.where({ id: [1, 2, 3] });
      });
    } finally {
      Notifications.unsubscribe(subscriber);
    }

    const select = events.find((e) => /^\s*SELECT/i.test(String(e.payload["sql"] ?? "")));
    expect(select).toBeDefined();
    expect(select!.payload["binds"]).toEqual([]);
    expect(String(select!.payload["sql"])).toMatch(/IN \(1, ?2, ?3\)/);
  });

  it("takes allow_retry from the collector, not a constant", async () => {
    // Rails sets `collector.retryable = true`, compiles, then reads
    // `allow_retry = collector.retryable` (database_statements.rb:29-45), so a
    // `BoundSqlLiteral` lowering it mid-traversal (arel to_sql.rb:770-771) is
    // reported non-retryable on the unprepared path too.
    const conn = (await Topic.leaseConnection()) as unknown as {
      unpreparedStatement(fn: () => Promise<void>): Promise<void>;
      toSqlAndBinds(arel: unknown): [string, unknown[], boolean | null, boolean];
    };
    await conn.unpreparedStatement(async () => {
      const rel = Topic.where("id = ?", 1) as unknown as { arel(): unknown };
      const [, , , allowRetry] = conn.toSqlAndBinds(rel.arel());
      expect(allowRetry).toBe(false);
    });
  });

  it("returns a top-level SqlLiteral untouched", async () => {
    // `Arel::Nodes::SqlLiteral < String`, so rb:23's
    // `Arel.arel_node?(x) && !(String === x)` is FALSE for one: Rails skips the
    // compile branch entirely and rb:48-49 returns it with the caller's
    // `preparable` / `allow_retry` intact. Routing it through
    // `visit_Arel_Nodes_SqlLiteral` instead (arel to_sql.rb) would force
    // `preparable = false` and clear `retryable`.
    const conn = (await Topic.leaseConnection()) as unknown as {
      toSqlAndBinds(
        arel: unknown,
        binds?: unknown[],
        preparable?: boolean | null,
        allowRetry?: boolean,
      ): [string, unknown[], boolean | null, boolean];
    };
    const literal = new Nodes.SqlLiteral("SELECT 1");
    const [sql, binds, preparable, allowRetry] = conn.toSqlAndBinds(literal, [], true, true);
    expect(sql).toBe("SELECT 1");
    expect(binds).toEqual([]);
    expect(preparable).toBe(true);
    expect(allowRetry).toBe(true);
  });
});
