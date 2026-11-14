import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base as ActionMailerBase, MailDeliveryJob } from "@blazetrails/actionmailer";
import type { MessageDelivery } from "@blazetrails/actionmailer/message-delivery";
import { TestHelper } from "@blazetrails/actionmailer/test-helper";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { constSet, include } from "@blazetrails/ruby-compat";
import { BounceMailer } from "../../support/test-helper.js";
import "../../../lib/inbound-email.js";
import type { InboundEmail } from "../../../lib/inbound-email.js";
import { Base } from "../../../lib/base.js";
import { TestHelper as ActionMailboxTestHelper } from "../../../lib/test-helper.js";

type Mailer = typeof BounceMailer & { bounce(options: { to: unknown }): MessageDelivery };

class BouncingWithReplyMailbox extends Base {
  async process(): Promise<void> {
    await this.bounceWith((BounceMailer as Mailer).bounce({ to: (await this.mail()).from() }));
  }
}

class BouncingWithImmediateReplyMailbox extends Base {
  async process(): Promise<void> {
    await this.bounceNowWith((BounceMailer as Mailer).bounce({ to: (await this.mail()).from() }));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class BouncingTest extends TestCase {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface BouncingTest
  extends Omit<TestHelper, "beforeSetup" | "afterTeardown">, ActionMailboxTestHelper {}
include(BouncingTest, ActionMailboxTestHelper);
include(BouncingTest, TestHelper);
constSet(Base, "BouncingTest", BouncingTest);

type Ctx = { testCase: unknown };

describe("ActionMailbox::Base::BouncingTest", () => {
  let inboundEmail: InboundEmail;

  beforeEach(async ({ testCase }: Ctx) => {
    inboundEmail = (await (testCase as BouncingTest).createInboundEmailFromMail({
      from: "sender@example.com",
      to: "replies@example.com",
      subject: "Bounce me",
    }))!;
  });

  afterEach(() => {
    ActionMailerBase.deliveries.length = 0;
  });

  it("bouncing with a reply", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.performEnqueuedJobs({ only: MailDeliveryJob }, async () => {
      await BouncingWithReplyMailbox.receive(inboundEmail);
    });

    expect(inboundEmail.isBounced()).toBeTruthy();
    await t.assertEmails(1);

    const mail = ActionMailerBase.deliveries.at(-1)!;
    expect([...(mail.to() as string[])]).toEqual(["sender@example.com"]);
    expect(mail.subject()).toBe("Your email was not delivered");
  });

  it("bouncing now with a reply", async ({ testCase }: Ctx) => {
    const t = testCase as TestHelper;
    await t.assertNoEnqueuedEmails(async () => {
      await BouncingWithImmediateReplyMailbox.receive(inboundEmail);
    });

    expect(inboundEmail.isBounced()).toBeTruthy();
    await t.assertEmails(1);

    const mail = ActionMailerBase.deliveries.at(-1)!;
    expect([...(mail.to() as string[])]).toEqual(["sender@example.com"]);
    expect(mail.subject()).toBe("Your email was not delivered");
  });
});
