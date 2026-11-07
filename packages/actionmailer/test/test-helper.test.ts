import { afterEach, beforeEach, describe, expect, it, type TestContext } from "vitest";
import type {} from "@blazetrails/activesupport/testing/autorun";
import { Assertion, assertNothingRaised, assertRaise, hours } from "@blazetrails/activesupport";
import { Encodings, Message } from "@blazetrails/mail";
import { InlineAdapter } from "@blazetrails/activejob";
import { File, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../lib/base.js";
import { MailDeliveryJob } from "../lib/mail-delivery-job.js";
import { NonInferrableMailerError, TestCase } from "../lib/test-case.js";
import type { TestHelper } from "../lib/test-helper.js";

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

  async testArgs(recipient: string, name: string) {
    return this.mail({
      body: await this.render({ inline: `Hello, ${name}` }),
      to: recipient,
      from: "tester@example.com",
    });
  }

  async testNamedArgs({ recipient, name }: { recipient?: string; name?: string }) {
    return this.mail({
      body: await this.render({ inline: `Hello, ${name}` }),
      to: recipient,
      from: "tester@example.com",
    });
  }

  async testParameterArgs() {
    return this.mail({
      body: await this.render({ inline: `All is ${this.params.all}` }),
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

class CustomQueueMailer extends TestHelperMailer {
  static {
    this.deliverLaterQueueName = "custom_queue";
  }
}
constSet(TopLevel, "CustomQueueMailer", CustomQueueMailer);

type Mailer = Record<
  string,
  (...args: unknown[]) => {
    deliverNow(): Promise<unknown>;
    deliverLater(options?: Record<string, unknown>): Promise<unknown>;
  }
>;
const testHelperMailer = TestHelperMailer as unknown as Mailer;
const customDeliveryMailer = CustomDeliveryMailer as unknown as Mailer;
const customQueueMailer = CustomQueueMailer as unknown as Mailer;
const withParams = (params: Record<string, unknown>) =>
  TestHelperMailer.with(params) as unknown as Mailer;

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

  it("assert emails with custom parameterized delivery job", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () =>
        (CustomDeliveryMailer.with({ foo: "bar" }) as unknown as Mailer)
          .testParameterArgs()
          .deliverLater(),
      );
    });
  });

  it("assert emails with enqueued emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => testHelperMailer.test().deliverLater());
    });
  });

  it("repeated assert emails calls", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => testHelperMailer.test().deliverNow());
    });

    await assertNothingRaised(async () => {
      await t.assertEmails(2, async () => {
        await testHelperMailer.test().deliverNow();
        await testHelperMailer.test().deliverNow();
      });
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
  it("assert no emails with enqueued emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertNoEmails(() => testHelperMailer.test().deliverLater());
    });

    expect(error.message).toMatch(/0 .* but 1/);
  });

  it("assert emails too few sent", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertEmails(2, () => testHelperMailer.test().deliverNow());
    });

    expect(error.message).toMatch(/2 .* but 1/);
  });

  it("assert emails too many sent", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertEmails(1, async () => {
        await testHelperMailer.test().deliverNow();
        await testHelperMailer.test().deliverNow();
      });
    });

    expect(error.message).toMatch(/1 .* but 2/);
  });

  it("assert emails message", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await testHelperMailer.test().deliverNow();
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertEmails(2, () => testHelperMailer.test().deliverNow());
    });
    expect(error.message).toMatch("Expected: 2");
    expect(error.message).toMatch("Actual: 1");
  });

  it("assert no emails failure", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertNoEmails(() => testHelperMailer.test().deliverNow());
    });

    expect(error.message).toMatch(/0 .* but 1/);
  });

  it("assert enqueued emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmails(1, () => testHelperMailer.test().deliverLater());
    });
  });

  it("assert enqueued parameterized emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmails(1, () => withParams({ a: 1 }).test().deliverLater());
    });
  });

  it("assert enqueued emails too few sent", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertEnqueuedEmails(2, () => testHelperMailer.test().deliverLater());
    });

    expect(error.message).toMatch(/2 .* but 1/);
  });

  it("assert enqueued emails with custom delivery job", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmails(1, () => customDeliveryMailer.test().deliverLater());
    });
  });

  it("assert enqueued emails too many sent", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertEnqueuedEmails(1, async () => {
        await testHelperMailer.test().deliverLater();
        await testHelperMailer.test().deliverLater();
      });
    });

    expect(error.message).toMatch(/1 .* but 2/);
  });

  it("assert no enqueued emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertNoEnqueuedEmails(() => testHelperMailer.test().deliverNow());
    });
  });

  it("assert no enqueued parameterized emails", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertNoEnqueuedEmails(() => withParams({ a: 1 }).test().deliverNow());
    });
  });

  it("assert no enqueued emails failure", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const error = await assertRaise([Assertion], {}, async () => {
      await t.assertNoEnqueuedEmails(() => testHelperMailer.test().deliverLater());
    });

    expect(error.message).toMatch(/0 .* but 1/);
  });

  it("assert enqueued email with", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test", {}, () =>
        testHelperMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when deliver later queue name is nil", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    Base.deliverLaterQueueName = null;

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test", {}, () =>
        testHelperMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when deliver later queue name with non default name", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    Base.deliverLaterQueueName = "sample_mailer_queue_name";

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test", {}, () =>
        testHelperMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when deliver later queue name is symbol", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    Base.deliverLaterQueueName = "mailers";

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test", {}, () =>
        testHelperMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when queue arg is symbol", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    Base.deliverLaterQueueName = "mailers";

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test", { queue: "mailers" }, () =>
        testHelperMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when mailer has custom deliver later queue", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(CustomQueueMailer, "test", {}, () =>
        customQueueMailer.test().deliverLater(),
      );

      await t.assertEnqueuedEmailWith(CustomQueueMailer, "test", { queue: "custom_queue" }, () =>
        customQueueMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with when mailer has custom delivery job", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(CustomDeliveryMailer, "test", {}, () =>
        customDeliveryMailer.test().deliverLater(),
      );
    });
  });

  it("assert enqueued email with with no block", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await testHelperMailer.test().deliverLater();
      await t.assertEnqueuedEmailWith(TestHelperMailer, "test");
    });
  });

  it("assert enqueued email with with args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer,
        "testArgs",
        { args: ["some_email", "some_name"] },
        () => testHelperMailer.testArgs("some_email", "some_name").deliverLater(),
      );
    });
  });

  it("assert enqueued email with with no block with args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await testHelperMailer.testArgs("some_email", "some_name").deliverLater();
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testArgs", {
        args: ["some_email", "some_name"],
      });
    });
  });

  it("assert enqueued email with with parameterized args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer,
        "testParameterArgs",
        { params: { all: "good" } },
        () => withParams({ all: "good" }).testParameterArgs().deliverLater(),
      );
    });
  });

  it("assert enqueued email with with parameterized mailer", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer.with({ all: "good" }),
        "testParameterArgs",
        {},
        () => withParams({ all: "good" }).testParameterArgs().deliverLater(),
      );
    });
  });

  it("assert enqueued email with with named args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer,
        "testNamedArgs",
        { args: [{ email: "some_email", name: "some_name" }] },
        () =>
          testHelperMailer.testNamedArgs({ email: "some_email", name: "some_name" }).deliverLater(),
      );
    });
  });

  it("assert enqueued email with with params and args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer,
        "testArgs",
        { params: { all: "good" }, args: ["some_email", "some_name"] },
        () => withParams({ all: "good" }).testArgs("some_email", "some_name").deliverLater(),
      );
    });
  });

  it("assert enqueued email with with params and named args", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(
        TestHelperMailer,
        "testNamedArgs",
        { params: { all: "good" }, args: [{ email: "some_email", name: "some_name" }] },
        () =>
          withParams({ all: "good" })
            .testNamedArgs({ email: "some_email", name: "some_name" })
            .deliverLater(),
      );
    });
  });

  it("assert enqueued email with with no block with parameterized args", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await withParams({ all: "good" }).testParameterArgs().deliverLater();
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testParameterArgs", {
        params: { all: "good" },
      });
    });
  });

  it("assert enqueued email with supports params matcher proc", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    const mailParams = { all: "good" };

    await withParams(mailParams).testParameterArgs().deliverLater();

    let matcherParams: unknown = null;

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testParameterArgs", {
        params: (params: unknown) => (matcherParams = params),
      });
    });

    expect(matcherParams).toEqual(mailParams);

    await assertRaise([Assertion], {}, async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testParameterArgs", {
        params: () => false,
      });
    });
  });

  it("assert enqueued email with supports args matcher proc", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    const mailArgs = ["some_email", "some_name"];

    await testHelperMailer.testArgs(...mailArgs).deliverLater();

    let matcherArgs: unknown = null;

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testArgs", {
        args: (args: unknown) => (matcherArgs = args),
      });
    });

    expect(matcherArgs).toEqual(mailArgs);

    await assertRaise([Assertion], {}, async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testArgs", { args: () => false });
    });
  });

  it("assert enqueued email with supports named args matcher proc", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as T;
    const mailArgs = [{ email: "some_email", name: "some_name" }];

    await testHelperMailer.testNamedArgs({ ...mailArgs[0] }).deliverLater();

    let matcherArgs: unknown = null;

    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmailWith(TestHelperMailer, "testNamedArgs", {
        args: (args: unknown) => (matcherArgs = args),
      });
    });

    expect(matcherArgs).toEqual(mailArgs);
  });

  it("deliver enqueued emails with no block", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await testHelperMailer.test().deliverLater();
      await t.deliverEnqueuedEmails();
    });

    await t.assertEmails(1);
  });

  it("deliver enqueued emails with a block", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.deliverEnqueuedEmails({}, () => testHelperMailer.test().deliverLater());
    });

    await t.assertEmails(1);
  });

  it("deliver enqueued emails with custom delivery job", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.deliverEnqueuedEmails({}, () => customDeliveryMailer.test().deliverLater());
    });

    await t.assertEmails(1);
  });

  it("deliver enqueued emails with custom queue", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.deliverEnqueuedEmails(
        { queue: CustomQueueMailer.deliverLaterQueueName },
        async () => {
          await testHelperMailer.test().deliverLater();
          await customQueueMailer.test().deliverLater();
        },
      );
    });

    await t.assertEmails(1);
    await t.assertEnqueuedEmailWith(TestHelperMailer, "test");
  });

  it("deliver enqueued emails with at", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.deliverEnqueuedEmails({ at: hours(1).fromNow() }, async () => {
        await testHelperMailer.test().deliverLater();
        await testHelperMailer.test().deliverLater({ wait: hours(2) });
      });
    });

    await t.assertEmails(1);
  });
});

class AnotherTestHelperMailerTest extends TestCase {
  static {
    this.tests(TestHelperMailer);
  }

  declare testVar: string;

  override setup(): void {
    this.testVar = "a value";
  }
}
constSet(TopLevel, "AnotherTestHelperMailerTest", AnotherTestHelperMailerTest);

describe("AnotherTestHelperMailerTest", () => {
  it("setup shouldnt conflict with mailer setup", ({ testCase }: TestContext) => {
    const t = testCase as AnotherTestHelperMailerTest & T;
    expect(t.expected).toBeInstanceOf(Message);
    expect(t.testVar).toBe("a value");
  });
});

class AdapterIsNotTestAdapterTest extends TestCase {
  override queueAdapterForTest = (): unknown => new InlineAdapter();
}
constSet(TopLevel, "AdapterIsNotTestAdapterTest", AdapterIsNotTestAdapterTest);

describe("AdapterIsNotTestAdapterTest", () => {
  it("can send email using any active job adapter", async ({ testCase }: TestContext) => {
    const t = testCase as T;
    await assertNothingRaised(async () => {
      await t.assertEmails(1, () => testHelperMailer.test().deliverNow());
    });
  });
});
