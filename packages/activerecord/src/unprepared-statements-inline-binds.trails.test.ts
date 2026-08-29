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
