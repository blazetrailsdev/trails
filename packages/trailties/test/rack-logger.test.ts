/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper`; the class/interface merge is how the mixin surfaces on the type side. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LogSubscriber,
  Notifications,
  TaggedLogging,
  type Logger as ActiveSupportLogger,
} from "@blazetrails/activesupport";
import {
  setup as testHelperSetup,
  teardown as testHelperTeardown,
  TestHelper,
  type MockLogger,
} from "@blazetrails/activesupport/log-subscriber/test-helper";
import {
  assertDifference,
  assertNoChanges,
  assertNoDifference,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport/testing/assertions";
import type { Fanout } from "@blazetrails/activesupport/notifications/fanout";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import type { RackApp, RackBody, RackResponse } from "@blazetrails/rack";
import { Logger } from "../lib/rack/logger.js";
import type { Tagger } from "../lib/rack/logger.js";

class TestLogger extends Logger {
  static NULL = { info() {} };

  private _testLogger: unknown;

  constructor(
    logger: unknown = TestLogger.NULL,
    { app = null, taggers = null }: { app?: RackApp | null; taggers?: Tagger[] | null } = {},
    block?: () => void,
  ) {
    app ??= async () => {
      block!();
      return [200, {}, []];
    };
    super(app, taggers);
    this._testLogger = logger;
  }

  override get logger(): any {
    return this._testLogger;
  }
}

class TestApp {
  constructor(public response: RackResponse) {}

  async call(_env: unknown): Promise<RackResponse> {
    return this.response;
  }
}

class Subscriber {
  constructor(
    public starts: unknown[][] = [],
    public finishes: unknown[][] = [],
  ) {}

  start(name: string, id: string, payload: unknown): void {
    this.starts.push([name, id, payload]);
  }

  finish(name: string, id: string, payload: unknown): void {
    this.finishes.push([name, id, payload]);
  }
}

interface LoggerTest extends Included<typeof TestHelper> {}

class LoggerTest {
  declare logger: MockLogger;
  declare notifier: Fanout;
  subscriber!: Subscriber;
  subscription!: ReturnType<typeof Notifications.notifier.subscribe>;

  static {
    include(this, TestHelper);
  }

  setup(): void {
    testHelperSetup.call(this as never);
    this.subscriber = new Subscriber();
    this.subscription = Notifications.notifier.subscribe(
      "request.action_dispatch",
      this.subscriber,
    );
  }

  teardown(): void {
    Notifications.notifier.unsubscribe(this.subscription);
    testHelperTeardown.call(this as never);
  }
}

const close = (body: RackBody): void => {
  (body as unknown as { close: () => void }).close();
};

describe("LoggerTest", () => {
  let t: LoggerTest;

  beforeEach(() => {
    t = new LoggerTest();
    t.setup();
  });

  afterEach(() => t.teardown());

  it("notification", async () => {
    const logger = new TestLogger(undefined, {}, () => {});

    await assertDifference(
      () => t.subscriber.starts.length,
      async () => {
        await assertDifference(
          () => t.subscriber.finishes.length,
          async () => {
            close((await logger.call({ REQUEST_METHOD: "GET" }))[2]);
          },
        );
      },
    );
  });

  it("notification on raise", async () => {
    const logger = new TestLogger(undefined, {}, () => {
      throw new NotImplementedError();
    });

    await assertDifference(
      () => t.subscriber.starts.length,
      async () => {
        await assertDifference(
          () => t.subscriber.finishes.length,
          async () => {
            await assertRaises([NotImplementedError], {}, () =>
              logger.call({ REQUEST_METHOD: "GET" }),
            );
          },
        );
      },
    );
  });

  it("logger does not mutate app return", async () => {
    const response = Object.freeze([]) as unknown as RackResponse;
    const app = new TestApp(response);
    const logger = new TestLogger(undefined, { app: app as unknown as RackApp });
    await assertNoChanges(
      () => response,
      null,
      {},
      async () => {
        await assertNothingRaised(() => logger.call({ REQUEST_METHOD: "GET" }));
      },
    );
  });

  it("logger is flushed after request finished", async () => {
    const loggerMiddleware = new TestLogger(undefined, {}, () => {});

    let flushCountInRequestEvent: number | null = null;
    const blockSub = t.notifier.subscribe("request.action_dispatch", () => {
      flushCountInRequestEvent = (LogSubscriber.logger as unknown as MockLogger).flushCount;
    });
    try {
      let responseBody: RackBody | null = null;
      await assertNoDifference(
        () => (LogSubscriber.logger as unknown as MockLogger).flushCount,
        async () => {
          responseBody = (await loggerMiddleware.call({ REQUEST_METHOD: "GET" }))[2];
        },
      );

      await assertDifference(
        () => (LogSubscriber.logger as unknown as MockLogger).flushCount,
        () => close(responseBody!),
      );

      const flushCount = (LogSubscriber.logger as unknown as MockLogger).flushCount;
      expect(flushCount - flushCountInRequestEvent!, "flush_all! should happen after event").toBe(
        1,
      );
    } finally {
      t.notifier.unsubscribe(blockSub);
    }
  });

  it("logger pushes tags", async () => {
    const logger = TaggedLogging.new(t.logger as unknown as ActiveSupportLogger);
    t.logger = logger as unknown as MockLogger;
    t.setLogger(t.logger);

    const taggers: Tagger[] = ["tag1", () => "tag2"];
    const loggerMiddleware = new TestLogger(logger, { taggers }, () => {
      expect(logger.formatter.currentTags).toEqual(["tag1", "tag2"]);
    });
    const blockSub = t.notifier.subscribe("request.action_dispatch", () => {
      expect(logger.formatter.currentTags).toEqual(["tag1", "tag2"]);
    });
    try {
      const responseBody = (await loggerMiddleware.call({ REQUEST_METHOD: "GET" }))[2];
      expect(logger.formatter.currentTags).toEqual(["tag1", "tag2"]);
      close(responseBody);
      expect(logger.formatter.currentTags).toEqual([]);
    } finally {
      t.notifier.unsubscribe(blockSub);
    }
  });
});
