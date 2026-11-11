/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper`; the class/interface merge is how the mixin surfaces on the type side. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setup as testHelperSetup,
  teardown as testHelperTeardown,
  TestHelper,
  type MockLogger,
} from "@blazetrails/activesupport/log-subscriber/test-helper";
import { RuntimeError, include, type Included } from "@blazetrails/ruby-compat";
import { Base } from "../lib/base.js";
import { LogSubscriber } from "../lib/log-subscriber.js";
import type { MessageDelivery } from "../lib/message-delivery.js";
import { BaseMailer as BaseMailerClass } from "./support/mailers/base-mailer.js";

type Mailer<T> = T & Record<string, (...args: unknown[]) => MessageDelivery>;
const BaseMailer = BaseMailerClass as Mailer<typeof BaseMailerClass>;

interface AMLogSubscriberTest extends Omit<Included<typeof TestHelper>, "setLogger"> {}

class AMLogSubscriberTest {
  declare logger: MockLogger;

  static {
    include(this, TestHelper);
  }

  setup(): void {
    testHelperSetup.call(this as never);
    LogSubscriber.attachTo("action_mailer");
  }

  setLogger(logger: MockLogger | null): void {
    Base.logger = logger;
  }
}

class BogusDelivery {
  constructor(..._args: unknown[]) {}

  deliverBang(_mail: unknown): never {
    throw new RuntimeError("failed");
  }
}

describe("AMLogSubscriberTest", () => {
  let t: AMLogSubscriberTest;
  let previousLogger: typeof Base.logger;
  let previousDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    previousLogger = Base.logger;
    previousDeliveryMethod = Base.deliveryMethod;
    Base.deliveryMethod = "test";
    t = new AMLogSubscriberTest();
    t.setup();
  });

  afterEach(() => {
    testHelperTeardown.call(t as never);
    Base.logger = previousLogger;
    Base.deliveryMethod = previousDeliveryMethod;
  });

  it("deliver is notified", async () => {
    try {
      await BaseMailer.welcome({ messageId: "123@abc" }).deliverNow();
      t.wait();

      expect(t.logger.logged(":info").length).toBe(1);
      expect(t.logger.logged(":info")[0]).toMatch(/Delivered mail 123@abc/);

      expect(t.logger.logged(":debug").length).toBe(2);
      expect(t.logger.logged(":debug")[0]).toMatch(
        /BaseMailer#welcome: processed outbound mail in [\d.]+ms/,
      );
      expect(t.logger.logged(":debug")[1]).toMatch(/Welcome/);
    } finally {
      BaseMailer.deliveries.length = 0;
    }
  });

  it("deliver message when perform deliveries is false", async () => {
    try {
      await BaseMailer.welcomeWithoutDeliveries({ messageId: "123@abc" }).deliverNow();
      t.wait();

      expect(t.logger.logged(":info").length).toBe(1);
      expect(t.logger.logged(":info")[0]).toMatch(
        "Skipped delivery of mail 123@abc as `perform_deliveries` is false",
      );

      expect(t.logger.logged(":debug").length).toBe(2);
      expect(t.logger.logged(":debug")[0]).toMatch(
        /BaseMailer#welcomeWithoutDeliveries: processed outbound mail in [\d.]+ms/,
      );
      expect(t.logger.logged(":debug")[1]).toMatch("Welcome");
    } finally {
      BaseMailer.deliveries.length = 0;
    }
  });

  it("deliver message when exception happened", async () => {
    const previousDeliveryMethod = BaseMailer.deliveryMethod;
    BaseMailer.deliveryMethod = BogusDelivery;
    try {
      await expect(BaseMailer.welcome({ messageId: "123@abc" }).deliverNow()).rejects.toThrow(
        RuntimeError,
      );
      t.wait();

      expect(t.logger.logged(":info").length).toBe(1);
      expect(t.logger.logged(":info")[0]).toBe(
        'Failed delivery of mail 123@abc error_class=RuntimeError error_message="failed"',
      );
    } finally {
      BaseMailer.deliveryMethod = previousDeliveryMethod;
    }
  });
});
