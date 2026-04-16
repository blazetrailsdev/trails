import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LogSubscriber, setVerboseQueryLogs } from "./log-subscriber.js";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  Logger,
} from "@blazetrails/activesupport";

const REGEXP_CLEAR_STR = `\\x1b\\[${BaseLogSubscriber.MODES.clear}m`;
const REGEXP_BOLD_STR = `\\x1b\\[${BaseLogSubscriber.MODES.bold}m`;
const REGEXP_MAGENTA_STR = escapeRegex(BaseLogSubscriber.MAGENTA);
const REGEXP_CYAN_STR = escapeRegex(BaseLogSubscriber.CYAN);

const SQL_COLORINGS: Record<string, string> = {
  SELECT: escapeRegex(BaseLogSubscriber.BLUE),
  INSERT: escapeRegex(BaseLogSubscriber.GREEN),
  UPDATE: escapeRegex(BaseLogSubscriber.YELLOW),
  DELETE: escapeRegex(BaseLogSubscriber.RED),
  LOCK: escapeRegex(BaseLogSubscriber.WHITE),
  ROLLBACK: escapeRegex(BaseLogSubscriber.RED),
  TRANSACTION: REGEXP_CYAN_STR,
  OTHER: REGEXP_MAGENTA_STR,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class MockLogger extends Logger {
  private _logged: Record<string, string[]> = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };

  constructor() {
    super(null);
  }

  logged(level: string): string[] {
    return this._logged[level] ?? [];
  }

  override debug(message?: string | (() => string)): boolean {
    if (this.level > Logger.DEBUG) return true;
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.debug.push(msg);
    return true;
  }

  override info(message?: string | (() => string)): boolean {
    if (this.level > Logger.INFO) return true;
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.info.push(msg);
    return true;
  }

  override warn(message?: string | (() => string)): boolean {
    if (this.level > Logger.WARN) return true;
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.warn.push(msg);
    return true;
  }

  override error(message?: string | (() => string)): boolean {
    if (this.level > Logger.ERROR) return true;
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.error.push(msg);
    return true;
  }
}

/**
 * Test-only subclass that captures debug output, mirroring Rails'
 * TestDebugLogSubscriber in the test file (not production code).
 */
class TestDebugLogSubscriber extends LogSubscriber {
  debugs: string[] = [];

  override get logger(): Logger | null {
    return (this.constructor as typeof LogSubscriber).logger;
  }

  protected override _debugSql(message: string): boolean {
    this.debugs.push(message);
    return super._debugSql(message);
  }
}

describe("LogSubscriberTest", () => {
  let mockLogger: MockLogger;
  let subscriber: TestDebugLogSubscriber;

  beforeEach(() => {
    mockLogger = new MockLogger();
    LogSubscriber.logger = mockLogger;
    TestDebugLogSubscriber.logger = mockLogger;
    LogSubscriber.colorizeLogging = true;
    subscriber = new TestDebugLogSubscriber();
  });

  afterEach(() => {
    LogSubscriber.logger = null;
    setVerboseQueryLogs(false);
  });

  it("schema statements are ignored", () => {
    expect(subscriber.debugs.length).toBe(0);

    subscriber.sql(new Event("sql.active_record", new Date(), { sql: "hi mom!" }));
    expect(subscriber.debugs.length).toBe(1);

    subscriber.sql(new Event("sql.active_record", new Date(), { sql: "hi mom!", name: "foo" }));
    expect(subscriber.debugs.length).toBe(2);

    subscriber.sql(new Event("sql.active_record", new Date(), { sql: "hi mom!", name: "SCHEMA" }));
    expect(subscriber.debugs.length).toBe(2);
  });

  it("sql statements are not squeezed", () => {
    subscriber.sql(makeEvent({ sql: "ruby   rails" }));
    expect(subscriber.debugs[0]).toMatch(/ruby {3}rails/);
  });

  it.skip("basic query logging", () => {});

  it("basic query logging coloration", () => {
    subscriber.colorizeLogging = true;
    for (const [verb, colorRegex] of Object.entries(SQL_COLORINGS)) {
      subscriber.sql(makeEvent({ sql: verb }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(`${REGEXP_BOLD_STR}${colorRegex}${verb}${REGEXP_CLEAR_STR}`, "i"),
      );
    }
  });

  it("logging sql coloration disabled", () => {
    subscriber.colorizeLogging = false;

    for (const [verb, colorRegex] of Object.entries(SQL_COLORINGS)) {
      subscriber.sql(makeEvent({ sql: verb }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).not.toMatch(
        new RegExp(`${REGEXP_BOLD_STR}${colorRegex}${verb}${REGEXP_CLEAR_STR}`, "i"),
      );
    }
  });

  it("basic payload name logging coloration generic sql", () => {
    subscriber.colorizeLogging = true;
    for (const verb of Object.keys(SQL_COLORINGS)) {
      subscriber.sql(makeEvent({ sql: verb }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(`${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR} \\(0\\.9ms\\)${REGEXP_CLEAR_STR}`, "i"),
      );

      subscriber.sql(makeEvent({ sql: verb, name: "SQL" }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR}SQL \\(0\\.9ms\\)${REGEXP_CLEAR_STR}`,
          "i",
        ),
      );
    }
  });

  it("basic payload name logging coloration named sql", () => {
    subscriber.colorizeLogging = true;
    for (const verb of Object.keys(SQL_COLORINGS)) {
      subscriber.sql(makeEvent({ sql: verb, name: "Model Load" }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_CYAN_STR}Model Load \\(0\\.9ms\\)${REGEXP_CLEAR_STR}`,
          "i",
        ),
      );

      subscriber.sql(makeEvent({ sql: verb, name: "Model Exists" }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_CYAN_STR}Model Exists \\(0\\.9ms\\)${REGEXP_CLEAR_STR}`,
          "i",
        ),
      );

      subscriber.sql(makeEvent({ sql: verb, name: "ANY SPECIFIC NAME" }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_CYAN_STR}ANY SPECIFIC NAME \\(0\\.9ms\\)${REGEXP_CLEAR_STR}`,
          "i",
        ),
      );
    }
  });

  it("async query", () => {
    subscriber.sql(
      makeEvent({
        sql: "SELECT * from models",
        name: "Model Load",
        async: true,
        lock_wait: 0.01,
      }),
    );
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
      /ASYNC Model Load \(0\.0ms\) \(db time 0\.9ms\).*SELECT/i,
    );
  });

  it("query logging coloration with nested select", () => {
    subscriber.colorizeLogging = true;
    for (const verb of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const colorRegex = SQL_COLORINGS[verb];
      subscriber.sql(makeEvent({ sql: `${verb} WHERE ID IN SELECT` }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR} \\(0\\.9ms\\)${REGEXP_CLEAR_STR}  ${REGEXP_BOLD_STR}${colorRegex}${verb} WHERE ID IN SELECT${REGEXP_CLEAR_STR}`,
          "i",
        ),
      );
    }
  });

  it("query logging coloration with multi line nested select", () => {
    subscriber.colorizeLogging = true;
    for (const verb of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const colorRegex = SQL_COLORINGS[verb];
      const sql = `
        ${verb}
        WHERE ID IN (
          SELECT ID FROM THINGS
        )
      `;
      subscriber.sql(makeEvent({ sql }));
      expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
        new RegExp(
          `${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR} \\(0\\.9ms\\)${REGEXP_CLEAR_STR}  ${REGEXP_BOLD_STR}${colorRegex}.*${verb}.*${REGEXP_CLEAR_STR}`,
          "mis",
        ),
      );
    }
  });

  it("query logging coloration with lock", () => {
    subscriber.colorizeLogging = true;

    let sql = `
      SELECT * FROM
        (SELECT * FROM mytable FOR UPDATE) ss
      WHERE col1 = 5;
    `;
    subscriber.sql(makeEvent({ sql }));
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
      new RegExp(
        `${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR} \\(0\\.9ms\\)${REGEXP_CLEAR_STR}  ${REGEXP_BOLD_STR}${SQL_COLORINGS.LOCK}.*FOR UPDATE.*${REGEXP_CLEAR_STR}`,
        "mis",
      ),
    );

    sql = `
      LOCK TABLE films IN SHARE MODE;
    `;
    subscriber.sql(makeEvent({ sql }));
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(
      new RegExp(
        `${REGEXP_BOLD_STR}${REGEXP_MAGENTA_STR} \\(0\\.9ms\\)${REGEXP_CLEAR_STR}  ${REGEXP_BOLD_STR}${SQL_COLORINGS.LOCK}.*LOCK TABLE.*${REGEXP_CLEAR_STR}`,
        "mis",
      ),
    );
  });

  it.skip("exists query logging", () => {});

  it("verbose query logs", () => {
    setVerboseQueryLogs(true);
    subscriber.sql(makeEvent({ sql: "hi mom!" }));
    expect(mockLogger.logged("debug").length).toBe(2);
    expect(mockLogger.logged("debug")[mockLogger.logged("debug").length - 1]).toMatch(/↳/);
  });

  it("verbose query with ignored callstack", () => {
    setVerboseQueryLogs(true);
    const original = (subscriber as any)._querySourceLocation;
    (subscriber as any)._querySourceLocation = () => null;
    subscriber.sql(makeEvent({ sql: "hi mom!" }));
    expect(mockLogger.logged("debug").length).toBe(1);
    expect(mockLogger.logged("debug")[mockLogger.logged("debug").length - 1]).not.toMatch(/↳/);
    (subscriber as any)._querySourceLocation = original;
  });

  it("verbose query logs disabled by default", () => {
    subscriber.sql(makeEvent({ sql: "hi mom!" }));
    const debugLogs = mockLogger.logged("debug");
    for (const msg of debugLogs) {
      expect(msg).not.toMatch(/↳/);
    }
  });

  it("cached queries", () => {
    subscriber.sql(makeEvent({ sql: "SELECT * FROM developers", name: "Developer Load" }));
    subscriber.sql(
      makeEvent({ sql: "SELECT * FROM developers", name: "Developer Load", cached: true }),
    );
    expect(subscriber.debugs.length).toBe(2);
    expect(subscriber.debugs[1]).toMatch(/CACHE/);
    expect(subscriber.debugs[1]).toMatch(/SELECT \* FROM developers/);
  });

  it("basic query doesnt log when level is not debug", () => {
    mockLogger.level = Logger.INFO;
    subscriber.sql(makeEvent({ sql: "SELECT * FROM developers", name: "Developer Load" }));
    expect(mockLogger.logged("debug").length).toBe(0);
  });

  it("cached queries doesnt log when level is not debug", () => {
    mockLogger.level = Logger.INFO;
    subscriber.sql(makeEvent({ sql: "SELECT * FROM developers", name: "Developer Load" }));
    subscriber.sql(
      makeEvent({ sql: "SELECT * FROM developers", name: "Developer Load", cached: true }),
    );
    expect(mockLogger.logged("debug").length).toBe(0);
  });

  it("where in binds logging include attribute names", () => {
    subscriber.sql(
      makeEvent({
        sql: "SELECT * FROM developers WHERE id IN (?, ?, ?)",
        name: "Developer Load",
        binds: [{ name: "id" }, { name: "id" }, { name: "id" }],
        type_casted_binds: [1, 2, 3],
      }),
    );
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(/\["id",1\]/);
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(/\["id",2\]/);
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(/\["id",3\]/);
  });

  it("binary data is not logged", () => {
    subscriber.sql(
      makeEvent({
        sql: "INSERT INTO binaries (data) VALUES (?)",
        name: "Binary Create",
        binds: [
          {
            name: "data",
            type: { binary: () => true },
            value: "some binary data",
            valueForDatabase: () => "some binary data",
          },
        ],
        type_casted_binds: ["some binary data"],
      }),
    );
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(/<16 bytes of binary data>/);
  });

  it("binary data hash", () => {
    subscriber.sql(
      makeEvent({
        sql: "INSERT INTO binaries (data) VALUES (?)",
        name: "Binary Create",
        binds: [
          {
            name: "data",
            type: { binary: () => true },
            value: '{"a":1}',
            valueForDatabase: () => '{"a":1}',
          },
        ],
        type_casted_binds: ['{"a":1}'],
      }),
    );
    expect(subscriber.debugs[subscriber.debugs.length - 1]).toMatch(/<7 bytes of binary data>/);
  });
});

function makeEvent(payload: Record<string, unknown>, durationMs = 0.9): Event {
  const start = new Date();
  const event = new Event("sql.active_record", start, payload);
  const end = new Date(start.getTime());
  event.finish(end);
  Object.defineProperty(event, "duration", { get: () => durationMs, configurable: true });
  return event;
}
