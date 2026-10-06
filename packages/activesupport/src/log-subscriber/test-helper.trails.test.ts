import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LogSubscriber } from "../log-subscriber.js";
import { Logger } from "../logger.js";
import { Notifications } from "../notifications.js";
import type { Event } from "../notifications/instrumenter.js";
import type { Fanout } from "../notifications/fanout.js";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import { MockLogger, TestHelper } from "./test-helper.js";

class MyLogSubscriber extends LogSubscriber {
  foo(_event: Event): void {
    this._debug("debug ");
    this._info(() => " info");
    this._warn();
  }
}

describe("ActiveSupport::LogSubscriber::TestHelper", () => {
  type Helped = Included<typeof TestHelper> & { logger: MockLogger; notifier: Fanout };
  class TestCase {}
  include(TestCase, TestHelper);
  const test = new TestCase() as Helped;
  let oldNotifier: Fanout;

  beforeEach(() => {
    oldNotifier = Notifications.notifier;
    test.setup();
  });

  afterEach(() => {
    LogSubscriber.subscribers.length = 0;
    LogSubscriber.logLevels.clear();
    test.teardown();
  });

  it("setup swaps in a MockLogger and a fresh notifier, and teardown restores them", () => {
    expect(LogSubscriber.logger).toBe(test.logger);
    expect(LogSubscriber.colorizeLogging).toBe(false);
    expect(Notifications.notifier).toBe(test.notifier);
    expect(test.notifier).not.toBe(oldNotifier);

    test.teardown();
    expect(Notifications.notifier).toBe(oldNotifier);
    test.setup();
  });

  it("reads back what an attached subscriber logged at each level", () => {
    MyLogSubscriber.attachTo("my_log_subscriber");
    Notifications.instrument("foo.my_log_subscriber");
    test.wait();

    expect(test.logger.logged(":debug")).toEqual(["debug"]);
    expect(test.logger.logged(":info")).toEqual(["info"]);
    expect(test.logger.logged(":warn")).toEqual([]);
    expect(test.logger.logged(":error")).toEqual([]);
  });

  it("answers a severity predicate from its level", () => {
    const logger = new MockLogger(Logger.WARN);
    expect(logger["debug?"]).toBe(false);
    expect(logger["warn?"]).toBe(true);
    expect(logger["unknown?"]).toBe(true);
    logger.level = Logger.DEBUG;
    expect(logger["debug?"]).toBe(true);
  });

  it("lets an including class overwrite setLogger", () => {
    const set: Array<MockLogger | null> = [];
    class Overriding {
      setLogger(logger: MockLogger | null): void {
        set.push(logger);
      }
    }
    include(Overriding, TestHelper);
    const overriding = new Overriding() as Overriding & Helped;
    overriding.setup();
    overriding.teardown();
    expect(set).toEqual([overriding.logger, null]);
  });

  it("counts flushes", () => {
    test.logger.flush();
    LogSubscriber.flushAllBang();
    expect(test.logger.flushCount).toBe(2);
  });
});
