import { describe, it, expect } from "vitest";
import { Notifications, NotificationEvent as Event } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/date";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";
import { Task } from "./test-helpers/models/task.js";

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

    expect(captured.length).toBe(2);
    expect(captured[1]).toEqual(captured[0]);
    expect(captured).toEqual(taskEvents.map((p) => conn.typeCastedBinds(p.binds as unknown[])));
    for (const value of captured.flat()) {
      expect(value).not.toHaveProperty("valueForDatabase");
      expect(["number", "bigint", "string", "boolean"]).toContain(typeof value);
    }
  });

  it("routes Temporal binds through the adapter's quoted_date", async () => {
    const conn = (await Base.connection) as unknown as {
      typeCastedBinds(binds: unknown[]): unknown[];
      quotedDate(value: unknown): string;
    };
    const instant = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");

    expect(conn.typeCastedBinds([instant])).toEqual([conn.quotedDate(instant)]);
    expect(typeof conn.typeCastedBinds([instant])[0]).toBe("string");
  });
});
