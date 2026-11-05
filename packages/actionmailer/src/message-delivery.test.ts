import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Base as ActiveJobBase, DeserializationError } from "@blazetrails/activejob";
import { TestHelper } from "@blazetrails/activejob/test-helper";
import {
  assertNothingRaised,
  minutes,
  hours,
  constantize,
  travelTo,
} from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Time } from "@blazetrails/date";
import { Message } from "@blazetrails/mail";
import {
  RuntimeError,
  StandardError,
  TopLevel,
  constSet,
  block,
  include,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import type { MessageDelivery } from "./message-delivery.js";

class DelayedMailerError extends StandardError {}
constSet(TopLevel, "DelayedMailerError", DelayedMailerError);

class DelayedMailer extends Base {
  static lastError: unknown = null;
  static lastRescueFromInstance: unknown = null;

  static {
    this.deliverLaterQueueName = "delayed_mailers";

    (this as unknown as { rescueFrom(...args: unknown[]): void }).rescueFrom(
      DelayedMailerError,
      block(function (this: unknown, error: unknown) {
        DelayedMailer.lastError = error;
        DelayedMailer.lastRescueFromInstance = this;
      }),
    );

    (this as unknown as { rescueFrom(...args: unknown[]): void }).rescueFrom(
      DeserializationError,
      block(function (this: unknown, error: unknown) {
        DelayedMailer.lastError = error;
        DelayedMailer.lastRescueFromInstance = this;
      }),
    );
  }

  testMessage(..._args: unknown[]) {
    return this.mail({
      from: "test-sender@test.com",
      to: "test-receiver@test.com",
      subject: "Test Subject",
      body: "Test Body",
    });
  }

  testKwargs(_options: { argument: unknown }) {
    return this.mail({
      from: "test-sender@test.com",
      to: "test-receiver@test.com",
      subject: "Test Subject",
      body: "Test Body",
    });
  }

  testRaise(klassName: string) {
    throw new (constantize(klassName) as new (message: string) => Error)("boom");
  }
}
constSet(TopLevel, "DelayedMailer", DelayedMailer);

type Mailer = typeof DelayedMailer & Record<string, (...args: unknown[]) => MessageDelivery>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MessageDeliveryTest extends TestCase {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
interface MessageDeliveryTest extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {}
include(MessageDeliveryTest, TestHelper);
constSet(TopLevel, "MessageDeliveryTest", MessageDeliveryTest);

class DummyJob extends MailDeliveryJob {}
constSet(MessageDeliveryTest, "DummyJob", DummyJob);

type Ctx = { testCase: unknown };

describe("MessageDeliveryTest", () => {
  let previousLogger: unknown;
  let previousDeliveryMethod: typeof Base.deliveryMethod;
  let mail: MessageDelivery;

  beforeEach(({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    previousLogger = ActiveJobBase.logger;
    previousDeliveryMethod = Base.deliveryMethod;

    ActiveJobBase.logger = null as never;
    Base.deliveryMethod = "test";

    const adapter = t.queueAdapter() as {
      performEnqueuedAtJobs: boolean;
      performEnqueuedJobs: boolean;
    };
    adapter.performEnqueuedAtJobs = true;
    adapter.performEnqueuedJobs = true;

    DelayedMailer.lastError = null;
    DelayedMailer.lastRescueFromInstance = null;

    mail = (DelayedMailer as Mailer).testMessage(1, 2, 3);
  });

  afterEach(() => {
    Base.deliveries.length = 0;

    ActiveJobBase.logger = previousLogger as never;
    Base.deliveryMethod = previousDeliveryMethod;

    DelayedMailer.lastError = null;
    DelayedMailer.lastRescueFromInstance = null;
  });

  it("should have a message", async () => {
    expect(await mail.message()).toBeTruthy();
  });

  it("its message should be a Mail::Message", async () => {
    expect((await mail.message()).constructor).toBe(Message);
  });

  it("should respond to .deliver_later", () => {
    expect(mail).toRespondTo("deliverLater");
  });

  it("should respond to .deliver_later!", () => {
    expect(mail).toRespondTo("deliverLaterBang");
  });

  it("should respond to .deliver_now", () => {
    expect(mail).toRespondTo("deliverNow");
  });

  it("should respond to .deliver_now!", () => {
    expect(mail).toRespondTo("deliverNowBang");
  });

  it("should enqueue the email with :deliver_now delivery method", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
      },
      () => mail.deliverLater(),
    );
  });

  it("should enqueue the email with :deliver_now! delivery method", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        args: ["DelayedMailer", "testMessage", "deliverNowBang", { args: [1, 2, 3] }],
      },
      () => mail.deliverLaterBang(),
    );
  });

  it("should enqueue delivery with a delay", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await travelTo(Time.new(2004, 11, 24, 1, 4, 44), {}, async () => {
      await t.assertPerformedWith(
        {
          job: MailDeliveryJob,
          at: Time.current().plus(minutes(10)),
          args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
        },
        () => mail.deliverLater({ wait: minutes(10) }),
      );
    });
  });

  it("should enqueue delivery with a priority", async () => {
    const job = (await mail.deliverLater({ priority: 10 })) as { priority: unknown };
    expect(job.priority).toBe(10);
  });

  it("should enqueue delivery at a specific time", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    const laterTime = Time.current().plus(hours(1));
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        at: laterTime,
        args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
      },
      () => mail.deliverLater({ waitUntil: laterTime }),
    );
  });

  it("should enqueue delivery on the correct queue", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
        queue: "delayed_mailers",
      },
      () => mail.deliverLater(),
    );
  });

  it("should enqueue delivery with the correct job", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    const oldDeliveryJob = DelayedMailer.deliveryJob;
    DelayedMailer.deliveryJob = DummyJob;

    await t.assertPerformedWith(
      {
        job: DummyJob,
        args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
      },
      () => mail.deliverLater(),
    );

    DelayedMailer.deliveryJob = oldDeliveryJob;
  });

  it("delivery queue can be overridden when enqueuing mail", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        args: ["DelayedMailer", "testMessage", "deliverNow", { args: [1, 2, 3] }],
        queue: "another_queue",
      },
      () => mail.deliverLater({ queue: "another_queue" }),
    );
  });

  it("delivery queue can be overridden in subclasses", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    const previousQueueName = DelayedMailer.deliverLaterQueueName;
    try {
      DelayedMailer.deliverLaterQueueName = "throttled_mailers";

      expect(DelayedMailer.deliverLaterQueueName).toBe("throttled_mailers");
      expect(Base.deliverLaterQueueName).toBe("mailers");

      await t.assertPerformedWith(
        {
          job: MailDeliveryJob,
          args: ["DelayedMailer", "testMessage", "deliverNow", { args: [] }],
          queue: "throttled_mailers",
        },
        () => (DelayedMailer as Mailer).testMessage().deliverLater(),
      );
    } finally {
      DelayedMailer.deliverLaterQueueName = previousQueueName;
    }
  });

  it("deliver_later after accessing the message is disallowed", async () => {
    await mail.message();

    await expect(mail.deliverLater()).rejects.toThrow(RuntimeError);
  });

  it("job delegates error handling to mailer", async () => {
    let message = (DelayedMailer as Mailer).testRaise("StandardError");
    await expect(message.deliverLater()).rejects.toThrow(StandardError);
    expect(DelayedMailer.lastError).toBeNull();
    expect(DelayedMailer.lastRescueFromInstance).toBeNull();

    message = (DelayedMailer as Mailer).testRaise("DelayedMailerError");
    await assertNothingRaised(() => message.deliverLater());
    expect((DelayedMailer.lastError as Error).message).toBe("boom");
    expect(DelayedMailer.lastRescueFromInstance).toBeInstanceOf(DelayedMailer);
  });

  it("allows for keyword arguments", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertPerformedWith(
      {
        job: MailDeliveryJob,
        args: ["DelayedMailer", "testKwargs", "deliverNow", { args: [{ argument: 1 }] }],
      },
      () => {
        const message = (DelayedMailer as Mailer).testKwargs({ argument: 1 });
        return message.deliverLater();
      },
    );
  });
});
