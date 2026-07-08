import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LogSubscriber } from "./log-subscriber.js";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  Logger,
} from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

// Trails-only: integer binds type-cast to BigInt (so SQLite binds them as
// SQLITE_INTEGER). Rails renders a bound Integer bare via `binds.inspect`,
// while a JSON serializer would quote it. These tests pin that a BigInt bind
// logs as bare digits AND that a string bind which resembles the internal
// bigint marker is never corrupted into a bare number.
class CapturingLogger extends Logger {
  messages: string[] = [];
  constructor() {
    super(null);
  }
  override debug(message?: string | (() => string)): boolean {
    this.messages.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

class TestSubscriber extends LogSubscriber {
  static logger: Logger | null = null;
  override get logger(): Logger | null {
    return TestSubscriber.logger;
  }
}

function makeEvent(payload: Record<string, unknown>): Event {
  const start = Temporal.Now.instant();
  const event = new Event("sql.active_record", start, payload);
  event.finish(start);
  Object.defineProperty(event, "duration", { get: () => 0.0, configurable: true });
  return event;
}

describe("LogSubscriber bigint bind rendering (trails)", () => {
  let logger: CapturingLogger;
  let subscriber: TestSubscriber;

  beforeEach(() => {
    logger = new CapturingLogger();
    TestSubscriber.logger = logger;
    BaseLogSubscriber.colorizeLogging = false;
    LogSubscriber.colorizeLogging = false;
    subscriber = new TestSubscriber();
  });

  afterEach(() => {
    TestSubscriber.logger = null;
  });

  it("renders a bigint bind as bare digits", () => {
    subscriber.sql(
      makeEvent({
        sql: "select * from topics where id = ?",
        name: "SQL",
        binds: [null],
        type_casted_binds: [10n],
      }),
    );
    expect(logger.messages[0]).toContain("[[null,10]]");
  });

  it("does not corrupt a string bind that resembles the bigint marker", () => {
    subscriber.sql(
      makeEvent({
        sql: "select * from topics where title = ?",
        name: "SQL",
        binds: [null],
        type_casted_binds: ["@bigint@123@bigint@"],
      }),
    );
    expect(logger.messages[0]).toContain('[[null,"@bigint@123@bigint@"]]');
  });

  it("renders bigint bare while preserving a colliding string in the same log", () => {
    subscriber.sql(
      makeEvent({
        sql: "select * from topics where id = ? and title = ?",
        name: "SQL",
        binds: [null, null],
        type_casted_binds: [7n, "@bigint@7@bigint@"],
      }),
    );
    expect(logger.messages[0]).toContain('[[null,7],[null,"@bigint@7@bigint@"]]');
  });
});
