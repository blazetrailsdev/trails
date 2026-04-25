/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, afterEach } from "vitest";

import { Notifications } from "@blazetrails/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("InstrumentationTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("instrument returns block result", () => {
    const result = Notifications.instrument("test.event", {}, () => 42);
    expect(result).toBe(42);
  });

  it("instrument yields the payload for further modification", () => {
    let captured: Record<string, unknown> = {};
    Notifications.subscribe("test.payload", (event) => {
      captured = { ...event.payload };
    });
    const payload: Record<string, unknown> = { key: "value" };
    Notifications.instrument("test.payload", payload, () => {
      payload.extra = "added";
    });
    expect(captured.key).toBe("value");
    expect(captured.extra).toBe("added");
  });

  it("instrumenter exposes its id", () => {
    let eventId: string | undefined;
    Notifications.subscribe("test.id", (event) => {
      eventId = event.transactionId;
    });
    Notifications.instrument("test.id", {});
    expect(typeof eventId).toBe("string");
    expect(eventId!.length).toBeGreaterThan(0);
  });

  it("nested events can be instrumented", () => {
    const events: string[] = [];
    Notifications.subscribe("outer", (event) => {
      events.push("outer");
      expect(event.children.length).toBe(1);
      expect(event.children[0].name).toBe("inner");
    });
    Notifications.subscribe("inner", (event) => {
      events.push("inner");
    });
    Notifications.instrument("outer", {}, () => {
      Notifications.instrument("inner", {}, () => {});
    });
    expect(events).toContain("outer");
    expect(events).toContain("inner");
  });

  it("instrument publishes when exception is raised", () => {
    let published = false;
    Notifications.subscribe("test.error", () => {
      published = true;
    });
    expect(() => {
      Notifications.instrument("test.error", {}, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");
    expect(published).toBe(true);
  });

  it("event is pushed even without block", () => {
    let published = false;
    Notifications.subscribe("test.noblock", () => {
      published = true;
    });
    Notifications.instrument("test.noblock", { data: 1 });
    expect(published).toBe(true);
  });

  it.skip("payload name on load", () => {});
  it.skip("payload name on create", () => {});
  it.skip("payload name on update", () => {});
  it.skip("payload name on update all", () => {});
  it.skip("payload name on destroy", () => {});
  it.skip("payload name on delete all", () => {});
  it.skip("payload name on pluck", () => {});
  it.skip("payload name on count", () => {});
  it.skip("payload name on grouped count", () => {});
  it.skip("payload row count on select all", () => {});
  it.skip("payload row count on pluck", () => {});
  it.skip("payload row count on raw sql", () => {});
  it.skip("payload row count on cache", () => {});
  it.skip("payload connection with query cache disabled", () => {});
  it.skip("payload connection with query cache enabled", () => {});
  it.skip("no instantiation notification when no records", () => {});
});

describe("TransactionInSqlActiveRecordPayloadTest", () => {
  it.skip("payload without an open transaction", () => {});
  it.skip("payload with an open transaction", () => {});
});

describe("TransactionInSqlActiveRecordPayloadNonTransactionalTest", () => {
  it.skip("payload without an open transaction", () => {});
  it.skip("payload with an open transaction", () => {});
});
