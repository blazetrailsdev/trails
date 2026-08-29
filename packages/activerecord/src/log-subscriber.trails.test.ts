import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LogSubscriber } from "./log-subscriber.js";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  Logger,
} from "@blazetrails/activesupport";

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
  const event = new Event("sql.active_record", null, null, "id", payload);
  Object.defineProperty(event, "duration", { get: () => 0.0, configurable: true });
  return event;
}

describe("LogSubscriber nil payload name (trails)", () => {
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
    BaseLogSubscriber.colorizeLogging = false;
    LogSubscriber.colorizeLogging = false;
  });

  it("renders a nil name as the empty string and still logs", () => {
    subscriber.sql(makeEvent({ sql: "select 1", name: null }));
    expect(logger.messages.length).toBe(1);
    expect(logger.messages[0]).toBe("   (0.0ms)  select 1");
  });

  it("colorizes a nil name the same as SQL", () => {
    BaseLogSubscriber.colorizeLogging = true;
    LogSubscriber.colorizeLogging = true;
    subscriber.sql(makeEvent({ sql: "select 1", name: null }));
    subscriber.sql(makeEvent({ sql: "select 1", name: "Topic Load" }));
    expect(logger.messages[0]).toContain(BaseLogSubscriber.MAGENTA);
    expect(logger.messages[0]).not.toContain(BaseLogSubscriber.CYAN);
    expect(logger.messages[1]).toContain(BaseLogSubscriber.CYAN);
  });
});

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
