import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { fixtures } from "./test-fixtures.js";
import { Task } from "./test-helpers/models/task.js";

/**
 * Trails-only: no Rails counterpart. Rails' `_insert_record` / `_update_record`
 * hand every column to Arel as an `ActiveModel::Attribute`, so
 * `visit_ActiveModel_Attribute → collector.add_bind(o)` makes every write-path
 * value a typed prepared-statement parameter — there is no inline-vs-bind split
 * to regress. trails' write path historically inlined every non-string column
 * via `quote()`; this pins that non-string values (here a datetime) now travel
 * as binds rather than SQL literals, on INSERT and UPDATE alike.
 */
describe("write-path prepared-statement binds", () => {
  fixtures({});

  it("binds non-string column values on INSERT and UPDATE", async () => {
    const starting = Temporal.Instant.from("2024-03-05T07:08:09.123456Z");
    const ending = Temporal.Instant.from("2025-03-05T07:08:09.123456Z");
    const events: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("sql.active_record", (e: Event) =>
      events.push(e.payload as Record<string, unknown>),
    );

    let task: Task;
    try {
      task = await Task.create({ starting, ending: null });
      task.ending = ending;
      await task.save();
    } finally {
      Notifications.unsubscribe(sub);
    }

    const insert = events.find((p) => /^INSERT INTO .?tasks.?/i.test(String(p.sql ?? "")));
    const update = events.find((p) => /^UPDATE .?tasks.?/i.test(String(p.sql ?? "")));
    expect(insert).toBeDefined();
    expect(update).toBeDefined();

    for (const payload of [insert!, update!]) {
      // The datetime never appears as an inline literal…
      expect(String(payload.sql)).not.toMatch(/202[45]-03-05/);
      // …because it travels in the bind slot (adapters differ on the wire
      // format — quoted_date string vs. driver-normalized — so match the
      // date prefix rather than one adapter's exact rendering).
      const casted = (
        typeof payload.type_casted_binds === "function"
          ? (payload.type_casted_binds as () => unknown[])()
          : (payload.type_casted_binds as unknown[])
      ).map(String);
      expect(casted.some((v) => /202[45]-03-05/.test(v))).toBe(true);
    }

    const reloaded = await Task.find(task.id);
    expect(String(reloaded.starting)).toBe(String(task.starting));
    expect(String(reloaded.ending)).toBe(String(task.ending));
  });
});
