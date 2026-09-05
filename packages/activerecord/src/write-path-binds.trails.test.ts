import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { Task } from "./test-helpers/models/task.js";

describe("write-path prepared-statement binds", () => {
  fixtures({});

  it("binds non-string column values on INSERT and UPDATE", async (ctx) => {
    ctx.skip(!(await Task.leaseConnection()).preparedStatements);
    const starting = RubyTime.utc(2024, 3, 5, 7, 8, 9, 123456);
    const ending = RubyTime.utc(2025, 3, 5, 7, 8, 9, 123456);
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
      expect(String(payload.sql)).not.toMatch(/202[45]-03-05/);
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
