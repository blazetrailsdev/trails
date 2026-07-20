import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "./base.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Task } from "./test-helpers/models/task.js";

/**
 * Trails-only: no Rails counterpart. Rails cannot regress this — it has exactly
 * one `type_casted_binds` (abstract/quoting.rb:224) and both the uncached
 * (`log`, abstract_adapter.rb:1134) and cached (`cache_notification_info`,
 * query_cache.rb:311) producers reach it through `self`. trails grew a second,
 * standalone implementation that never reached the adapter's `type_cast`, so
 * the two payloads could disagree per adapter. This pins them equal.
 */
describe("sql.active_record type_casted_binds", () => {
  fixtures({});

  it("carries equal values on the cached and uncached paths", async () => {
    const conn = await Base.connection;
    const task = await Task.create({ starting: null, ending: null });
    const events: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("sql.active_record", (e: Event) =>
      events.push(e.payload as Record<string, unknown>),
    );

    try {
      await conn.cache(async () => {
        await Task.find(task.id);
        await Task.find(task.id);
      });
    } finally {
      Notifications.unsubscribe(sub);
    }

    const taskEvents = events.filter((p) => /FROM\s+.?tasks.?/i.test(String(p.sql ?? "")));
    const captured = taskEvents.map((p) => {
      const casted = p.type_casted_binds;
      return typeof casted === "function" ? casted() : casted;
    });

    // Two events for the same query: the first executes, the second is served
    // from the query cache.
    expect(captured.length).toBe(2);
    expect(captured[1]).toEqual(captured[0]);
    // ...and that each payload's casted slot is exactly what the adapter's own
    // `typeCastedBinds` yields for that payload's `binds`, so neither path can
    // drift back onto a standalone helper that skips `typeCast`. Compared
    // against the event's own binds rather than a literal `[task.id]`: adapters
    // legitimately differ in what reaches the slot (MySQL reports the driver
    // binds, which are empty for an interpolated statement).
    expect(captured).toEqual(taskEvents.map((p) => conn.typeCastedBinds(p.binds as unknown[])));
    // The comparison above pins dispatch; this pins that the slot actually
    // holds cast primitives. An un-cast Attribute would satisfy the equality
    // (both sides would be wrong) but fails here, and is exactly what
    // LogSubscriber renders as "[object Object]".
    for (const value of captured.flat()) {
      expect(value).not.toHaveProperty("valueForDatabase");
      expect(["number", "bigint", "string", "boolean"]).toContain(typeof value);
    }
  });

  it("routes Temporal binds through the adapter's quoted_date", async () => {
    // The deleted standalone helper converted Temporal values with
    // `temporalToBindString`. Rails has no such helper: `type_cast` dispatches
    // Date/Time through `self.quoted_date` (abstract/quoting.rb:103-104), so the
    // adapter's own override is what fills the slot. This pins that the
    // conversion survived the sweep, and that it is the adapter's format —
    // PG suffixes " BC" for year <= 0, MySQL caps fractional seconds at 6.
    const conn = (await Base.connection) as unknown as {
      typeCastedBinds(binds: unknown[]): unknown[];
      quotedDate(value: unknown): string;
    };
    const instant = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");

    expect(conn.typeCastedBinds([instant])).toEqual([conn.quotedDate(instant)]);
    // Not merely passed through as a Temporal object — drivers reject those.
    expect(typeof conn.typeCastedBinds([instant])[0]).toBe("string");
  });
});
