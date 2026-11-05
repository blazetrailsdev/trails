import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { TestHelper } from "@blazetrails/activejob/test-helper";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  Method,
  NameError,
  TopLevel,
  block,
  constSet,
  include,
  rbObjMethod,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import type { Collector } from "./collector.js";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import type { MessageDelivery } from "./message-delivery.js";

class ParamsMailer extends Base {
  declare inviter: unknown;
  declare invitee: unknown;

  static {
    (this as unknown as { beforeAction(b: unknown): void }).beforeAction(
      block(function (this: ParamsMailer) {
        [this.inviter, this.invitee] = [this.params.inviter, this.params.invitee];
      }),
    );

    this.default({
      to: function (this: ParamsMailer) {
        return this.invitee;
      },
      from: function (this: ParamsMailer) {
        return this.inviter;
      },
    });
  }

  invitation() {
    return this.mail({ subject: "Welcome to the project!" }, (format: Collector) => {
      (format as unknown as { text(b: () => unknown): void }).text(() =>
        this.render({ plain: `So says ${this.inviter}` }),
      );
    });
  }
}
constSet(TopLevel, "ParamsMailer", ParamsMailer);

type Invitable = { invitation(): MessageDelivery };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ParameterizedTest extends TestCase {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
interface ParameterizedTest extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {}
include(ParameterizedTest, TestHelper);
constSet(TopLevel, "ParameterizedTest", ParameterizedTest);

class DummyDeliveryJob extends MailDeliveryJob {}
constSet(ParameterizedTest, "DummyDeliveryJob", DummyDeliveryJob);

type Ctx = { testCase: unknown };

describe("ParameterizedTest", () => {
  let previousLogger: unknown;
  let previousDeliveryMethod: unknown;
  let mail: MessageDelivery;

  beforeEach(() => {
    previousLogger = ActiveJobBase.logger;
    ActiveJobBase.logger = null as never;

    previousDeliveryMethod = Base.deliveryMethod;
    Base.deliveryMethod = "test";

    mail = (
      ParamsMailer.with({
        inviter: "david@basecamp.com",
        invitee: "jason@basecamp.com",
      }) as unknown as Invitable
    ).invitation();
  });

  afterEach(() => {
    ActiveJobBase.logger = previousLogger as never;
    ParamsMailer.deliveries.length = 0;
    Base.deliveryMethod = previousDeliveryMethod;
  });

  it("parameterized headers", async () => {
    const message = await mail.message();
    expect([...(message.to() as string[])]).toEqual(["jason@basecamp.com"]);
    expect([...(message.from() as string[])]).toEqual(["david@basecamp.com"]);
    expect(message.body().encoded()).toBe("So says david@basecamp.com");
  });

  it("degrade gracefully when .with is not called", async () => {
    mail = (ParamsMailer as unknown as Invitable).invitation();

    const message = await mail.message();
    expect(message.to()).toBeNull();
    expect(message.from()).toBeNull();
  });

  it("enqueue the email with params", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    const args = [
      "ParamsMailer",
      "invitation",
      "deliverNow",
      {
        params: { inviter: "david@basecamp.com", invitee: "jason@basecamp.com" },
        args: [],
      },
    ];
    await t.assertPerformedWith({ job: MailDeliveryJob, args: args }, () => mail.deliverLater());
  });

  it("respond_to?", () => {
    const mailer = ParamsMailer.with({
      inviter: "david@basecamp.com",
      invitee: "jason@basecamp.com",
    });

    expect(rbObjRespondTo(mailer, "invitation")).toBe(true);
    expect(rbObjRespondTo(mailer, "anything")).toBe(false);

    const invitation = rbObjMethod(mailer, "invitation");
    expect(invitation.constructor).toBe(Method);

    expect(() => rbObjMethod(mailer, "anything")).toThrow(NameError);
  });

  it("should enqueue a parameterized request with the correct delivery job", async ({
    testCase,
  }: Ctx) => {
    const t = testCase as TestHelper;
    const args = [
      "ParamsMailer",
      "invitation",
      "deliverNow",
      {
        params: { inviter: "david@basecamp.com", invitee: "jason@basecamp.com" },
        args: [],
      },
    ];

    await withDeliveryJob(DummyDeliveryJob, () =>
      t.assertPerformedWith({ job: DummyDeliveryJob, args: args }, () => mail.deliverLater()),
    );
  });

  async function withDeliveryJob(
    job: typeof MailDeliveryJob,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    const oldDeliveryJob = ParamsMailer.deliveryJob;
    try {
      ParamsMailer.deliveryJob = job;
      await fn();
    } finally {
      ParamsMailer.deliveryJob = oldDeliveryJob;
    }
  }
});
