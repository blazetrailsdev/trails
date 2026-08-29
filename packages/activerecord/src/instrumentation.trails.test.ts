import { describe, it, expect, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { StatementInvalid } from "./errors.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";

describe("Instrumentation exception payload (trails)", () => {
  fixtures(["books"]);

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("sets exception and exception_object on a failed query", async () => {
    const payloads: Record<string, unknown>[] = [];
    Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      payloads.push(event.payload);
    });

    await expect(Base.connection.execute("SELECT * FROM definitely_not_a_table")).rejects.toThrow();

    const failed = payloads.filter((p) => p.exception_object !== undefined);
    expect(failed).toHaveLength(1);
    const [className, message] = failed[0].exception as [string, string];
    expect(className).toBe("StatementInvalid");
    expect(message).toMatch(/definitely_not_a_table/);
    expect(failed[0].exception_object).toBeInstanceOf(StatementInvalid);
    expect((failed[0].exception_object as Error).message).toBe(message);
  });

  it("leaves exception keys unset on a successful query", async () => {
    const payloads: Record<string, unknown>[] = [];
    Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      payloads.push(event.payload);
    });

    await Base.connection.execute("SELECT 1");

    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.exception).toBeUndefined();
      expect(p.exception_object).toBeUndefined();
    }
  });
});
