/**
 * trails-only coverage: the `sql.active_record` payload carries the exception
 * keys on a failed query. Rails gets these from Instrumenter#instrument's
 * `rescue Exception` arm; the adapters used to hand-roll them at each call
 * site. This pins that the inherited arm still covers the adapter paths.
 */
import { describe, it, expect, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import "./test-helpers/canonical-model-index.js";

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
    // Rails' arm records [class name, message] alongside the error itself.
    expect(failed[0].exception).toEqual([
      (failed[0].exception_object as Error).constructor.name,
      (failed[0].exception_object as Error).message,
    ]);
    expect(failed[0].exception_object).toBeInstanceOf(Error);
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
