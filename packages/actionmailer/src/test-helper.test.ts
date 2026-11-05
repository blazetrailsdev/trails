import { afterEach, beforeEach, describe, expect, it, type TestContext } from "vitest";
import type {} from "@blazetrails/activesupport/testing/autorun";
import { assertNothingRaised, assertRaise } from "@blazetrails/activesupport";
import { Encodings, Message } from "@blazetrails/mail";
import { File, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { MailDeliveryJob } from "./mail-delivery-job.js";
import { NonInferrableMailerError, TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";

type T = TestCase & TestHelper;

class TestHelperMailer extends Base {
  declare world: string;

  async test() {
    this.world = "Earth";
    return this.mail({
      body: await this.render({ inline: "Hello, <%= this.world %>" }),
      subject: "Hi!",
      to: "test@example.com",
      from: "tester@example.com",
    });
  }
}
constSet(TopLevel, "TestHelperMailer", TestHelperMailer);

class CustomDeliveryJob extends MailDeliveryJob {}
constSet(TopLevel, "CustomDeliveryJob", CustomDeliveryJob);

class CustomDeliveryMailer extends TestHelperMailer {
  static {
    this.deliveryJob = CustomDeliveryJob;
  }
}
constSet(TopLevel, "CustomDeliveryMailer", CustomDeliveryMailer);

type Mailer = Record<
  string,
  () => { deliverNow(): Promise<unknown>; deliverLater(): Promise<unknown> }
>;
const testHelperMailer = TestHelperMailer as unknown as Mailer;
const customDeliveryMailer = CustomDeliveryMailer as unknown as Mailer;

class TestHelperMailerTest extends TestCase {}
constSet(TopLevel, "TestHelperMailerTest", TestHelperMailerTest);

describe("TestHelperMailerTest", () => {
  let previousDeliverLaterQueueName: unknown;

  beforeEach(() => {
    previousDeliverLaterQueueName = Base.deliverLaterQueueName;
  });

  afterEach(() => {
    Base.deliverLaterQueueName = previousDeliverLaterQueueName;
  });

  it("setup sets right action mailer options", () => {
    expect(Base.deliveryMethod).toBe("test");
    expect(Base.performDeliveries).toBeTruthy();
    expect(Base.deliveries).toEqual([]);
  });

  it("setup creates the expected mailer", ({ testCase }: TestContext) => {
    const t = testCase as T;
    expect(t.expected).toBeInstanceOf(Message);
    expect(t.expected.mimeVersion()).toBe("1.0");
    expect(t.expected.mimeType()).toBe("text/plain");
  });

  it("mailer class is correctly inferred", ({ testCase }: TestContext) => {
    expect((testCase.constructor as typeof TestCase).mailerClass()).toBe(TestHelperMailer);
  });

  it("determine default mailer raises correct error", async ({ testCase }: TestContext) => {
    await assertRaise([NonInferrableMailerError], {}, () => {
      (testCase.constructor as typeof TestCase).determineDefaultMailer("NotAMailerTest");
    });
  });

  it("charset is utf 8", ({ testCase }: TestContext) => {
    expect((testCase as T).charset()).toBe("UTF-8");
  });

  it("encode", ({ testCase }: TestContext) => {
    expect(Encodings.qValueDecode((testCase as T).encode("This is あ string"))).toBe(
      "This is あ string",
    );
  });

  it("read fixture", async ({ testCase }: TestContext) => {
    const previous = TopLevel.Trails;
    const root = File.expandPath("test-helpers", import.meta.dirname);
    TopLevel.Trails = { root: () => root } as unknown as typeof TopLevel.Trails;
    try {
      expect(await (testCase as T).readFixture("welcome")).toEqual(["Welcome!"]);
    } finally {
      TopLevel.Trails = previous;
    }
  });

  it("assert emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => testHelperMailer.test().deliverNow());
    });
  });

  it("capture emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      let emails = await t.captureEmails(() => testHelperMailer.test().deliverNow());
      const email = emails[0];
      expect(email).toBeInstanceOf(Message);
      expect(String(email.body())).toBe("Hello, Earth");
      expect(email.subject()).toBe("Hi!");

      emails = await t.captureEmails(async () => {
        await testHelperMailer.test().deliverNow();
        await testHelperMailer.test().deliverNow();
      });
      expect(emails).toBeInstanceOf(Array);
      expect(emails[0]).toBeInstanceOf(Message);
      expect(emails[1]).toBeInstanceOf(Message);
    });
  });

  it("assert emails with custom delivery job", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => customDeliveryMailer.test().deliverLater());
    });
  });

  it("assert emails with enqueued emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => testHelperMailer.test().deliverLater());
    });
  });

  it("assert emails with no block", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await testHelperMailer.test().deliverNow();
      await t.assertEmails(1);
    });

    await assertNothingRaised(async () => {
      await testHelperMailer.test().deliverNow();
      await testHelperMailer.test().deliverNow();
      await t.assertEmails(3);
    });
  });

  it("assert no emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertNoEmails(() => {
        testHelperMailer.test();
      });
    });
  });
});
