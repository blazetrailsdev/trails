import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LogSubscriber } from "../log-subscriber.js";
import { Logger } from "../logger.js";
import { Notifications } from "../notifications.js";
import type { Event } from "../notifications/instrumenter.js";
import type { Fanout } from "../notifications/fanout.js";
import { MockLogger, setLogger, setup, teardown, wait } from "./test-helper.js";

class MyLogSubscriber extends LogSubscriber {
  foo(_event: Event): void {
    this._debug("debug ");
    this._info(() => " info");
    this._warn();
  }
}

describe("ActiveSupport::LogSubscriber::TestHelper", () => {
  const test = {
    logger: undefined as unknown as MockLogger,
    notifier: undefined as unknown as Fanout,
    oldNotifier: undefined as unknown as Fanout,
    setLogger,
  };
  let oldNotifier: Fanout;

  beforeEach(() => {
    oldNotifier = Notifications.notifier;
    setup.call(test);
  });

  afterEach(() => {
    LogSubscriber.subscribers.length = 0;
    LogSubscriber.logLevels.clear();
    teardown.call(test);
  });

  it("setup swaps in a MockLogger and a fresh notifier, and teardown restores them", () => {
    expect(LogSubscriber.logger).toBe(test.logger);
    expect(LogSubscriber.colorizeLogging).toBe(false);
    expect(Notifications.notifier).toBe(test.notifier);
    expect(test.notifier).not.toBe(oldNotifier);

    teardown.call(test);
    expect(Notifications.notifier).toBe(oldNotifier);
    setup.call(test);
  });

  it("reads back what an attached subscriber logged at each level", () => {
    MyLogSubscriber.attachTo("my_log_subscriber");
    Notifications.instrument("foo.my_log_subscriber");
    wait.call(test);

    expect(test.logger.logged("debug")).toEqual(["debug"]);
    expect(test.logger.logged("info")).toEqual(["info"]);
    expect(test.logger.logged("warn")).toEqual([]);
    expect(test.logger.logged("error")).toEqual([]);
  });

  it("answers a severity predicate from its level", () => {
    const logger = new MockLogger(Logger.WARN);
    expect(logger["debug?"]).toBe(false);
    expect(logger["warn?"]).toBe(true);
    expect(logger["unknown?"]).toBe(true);
    logger.level = Logger.DEBUG;
    expect(logger["debug?"]).toBe(true);
  });

  it("counts flushes", () => {
    test.logger.flush();
    LogSubscriber.flushAllBang();
    expect(test.logger.flushCount).toBe(2);
  });
});
