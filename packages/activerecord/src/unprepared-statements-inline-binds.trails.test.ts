/**
 * Trails-only: no Rails counterpart. Rails' `to_sql_and_binds`
 * (activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb:31-45)
 * picks its collector from `prepared_statements`: with the flag off it compiles
 * through `SubstituteBinds` (`abstract_adapter.rb#collector`), so every value
 * inlines during traversal and `binds` comes back empty.
 *
 * Rails cannot regress this — the collector choice *is* the branch. trails
 * compiles through `compileWithBinds` on every path, so the flag has to be
 * consulted explicitly at each compile site; this pins that it is.
 */
import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

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
});
