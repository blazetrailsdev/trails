import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { Notifications } from "./notifications.js";
import { LogSubscriber } from "./log-subscriber.js";
import { Logger } from "./logger.js";
import { Event } from "./notifications/instrumenter.js";
import { assertEmpty, assertNotEmpty } from "./testing/assertions.js";
import { assertNotCalled } from "./testing/method-call-assertions.js";

class MockLogger extends Logger {
  private _logged: Record<string, string[]> = {
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
    unknown: [],
  };
  flushCount = 0;

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

  override fatal(message?: string | (() => string)): boolean {
    if (this.level > Logger.FATAL) return true;
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.fatal.push(msg);
    return true;
  }

  override unknown(message?: string | (() => string)): boolean {
    const msg = typeof message === "function" ? message() : (message ?? "");
    this._logged.unknown.push(msg);
    return true;
  }

  flush(): void {
    this.flushCount++;
  }
}

class MyLogSubscriber extends LogSubscriber {
  event: Event | null = null;

  someEvent(event: Event): void {
    this.event = event;
    this._info(event.name);
  }

  foo(_event: Event | null): void {
    this._debug("debug");
    this._info(() => "info");
    this._warn("warn");
  }

  bar(_event: Event | null): void {
    this._info(`${this.color("cool", "red")}, ${this.color("isn't it?", "blue", { bold: true })}`);
  }

  baz(_event: Event | null): void {
    this._info(
      `${this.color("rad", "green", { bold: true, underline: true })}, ${this.color("isn't it?", "yellow", { italic: true })}`,
    );
  }

  puke(_event: Event | null): void {
    throw new Error("puke");
  }

  debugOnly(_event: Event | null): void {
    this._debug("debug logs are enabled");
  }
}

describe("SyncLogSubscriberTest", () => {
  let logger: MockLogger;
  let logSubscriber: MyLogSubscriber;

  beforeEach(() => {
    logger = new MockLogger();
    logSubscriber = new MyLogSubscriber();
    LogSubscriber.logger = logger;
    LogSubscriber.colorizeLogging = false;
  });

  afterEach(() => {
    const subs = LogSubscriber.subscribers;
    while (subs.length > 0) {
      const sub = subs.pop()!;
      for (const [, handle] of sub.patterns) {
        Notifications.unsubscribe(handle);
      }
    }
    LogSubscriber.logger = null;
    LogSubscriber.logLevels.clear();
    Notifications.unsubscribeAll();
  });

  it("proxies method to rails logger", () => {
    logSubscriber.foo(null);
    expect(logger.logged("debug")).toEqual(["debug"]);
    expect(logger.logged("info")).toEqual(["info"]);
    expect(logger.logged("warn")).toEqual(["warn"]);
  });

  it("set color for messages", () => {
    LogSubscriber.colorizeLogging = true;
    logSubscriber.bar(null);
    expect(logger.logged("info")[logger.logged("info").length - 1]).toBe(
      "\x1b[31mcool\x1b[0m, \x1b[1m\x1b[34misn't it?\x1b[0m",
    );
  });

  it("set mode for messages", () => {
    LogSubscriber.colorizeLogging = true;
    logSubscriber.baz(null);
    expect(logger.logged("info")[logger.logged("info").length - 1]).toBe(
      "\x1b[1;4m\x1b[32mrad\x1b[0m, \x1b[3m\x1b[33misn't it?\x1b[0m",
    );
  });

  it("does not set color if colorize logging is set to false", () => {
    logSubscriber.bar(null);
    expect(logger.logged("info")[logger.logged("info").length - 1]).toBe("cool, isn't it?");
  });

  it("event is sent to the registered class", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    Notifications.instrument("some_event.my_log_subscriber");
    expect(logger.logged("info")).toEqual(["some_event.my_log_subscriber"]);
  });

  it("event is an active support notifications event", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    Notifications.instrument("some_event.my_log_subscriber");
    expect(logSubscriber.event).toBeInstanceOf(Event);
  });

  it.skip("event attributes", () => {
    // BLOCKED: notifications-event-allocations-has-no-js-allocation-counter
    const JRUBY_VERSION: string | null = null;
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    Notifications.instrument("some_event.my_log_subscriber", {}, () => {
      return [];
    });
    const event = logSubscriber.event!;
    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors log_subscriber_test.rb:96
    if (JRUBY_VERSION != null) {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(event.cpuTime).toBe(0);
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(event.allocations).toBe(0);
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(event.cpuTime).toBeGreaterThan(0);
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(event.allocations).toBeGreaterThan(0);
    }
    expect(event.duration).toBeGreaterThan(0);
    expect(event.idleTime).toBeGreaterThanOrEqual(0);
  });

  it("does not send the event if it doesnt match the class", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    expect(() => {
      Notifications.instrument("unknown_event.my_log_subscriber");
    }).not.toThrow();
  });

  it("does not send the event if logger is nil", () => {
    LogSubscriber.logger = null;
    assertNotCalled(logSubscriber, "someEvent", null, () => {
      MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
      Notifications.instrument("some_event.my_log_subscriber");
    });
  });

  it("does not fail with non namespaced events", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    expect(() => {
      Notifications.instrument("whatever");
    }).not.toThrow();
  });

  it("flushes loggers", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    LogSubscriber.flushAllBang();
    expect(logger.flushCount).toBe(1);
  });

  it("flushes the same logger just once", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    LogSubscriber.flushAllBang();
    expect(logger.flushCount).toBe(1);
  });

  it("logging does not die on failures", () => {
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    Notifications.instrument("puke.my_log_subscriber");
    Notifications.instrument("some_event.my_log_subscriber");

    expect(logger.logged("info").length).toBe(1);
    expect(logger.logged("info")[0]).toBe("some_event.my_log_subscriber");

    expect(logger.logged("error").length).toBe(1);
    expect(logger.logged("error")[0]).toMatch(
      /Could not log "puke.my_log_subscriber" event\. Error: puke/,
    );
  });

  it("subscribe log level", () => {
    MyLogSubscriber.logger = logger;
    logger.level = Logger.INFO;
    MyLogSubscriber.subscribeLogLevel("debug_only", "debug");
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    assertEmpty(logger.logged("debug"));

    Notifications.instrument("debug_only.my_log_subscriber");
    assertEmpty(logger.logged("debug"));

    logger.level = Logger.DEBUG;
    Notifications.instrument("debug_only.my_log_subscriber");
    assertNotEmpty(logger.logged("debug"));
  });

  it("subscribe log level with non numeric levels", () => {
    const semanticLogger = new MockLogger();
    LogSubscriber.logger = semanticLogger;
    MyLogSubscriber.logger = semanticLogger;
    semanticLogger.level = Logger.INFO;
    MyLogSubscriber.subscribeLogLevel("debug_only", "debug");
    MyLogSubscriber.attachTo("my_log_subscriber", logSubscriber);
    assertEmpty(semanticLogger.logged("debug"));

    Notifications.instrument("debug_only.my_log_subscriber");
    assertEmpty(semanticLogger.logged("debug"));

    semanticLogger.level = Logger.DEBUG;
    Notifications.instrument("debug_only.my_log_subscriber");
    assertNotEmpty(semanticLogger.logged("debug"));
  });
});
