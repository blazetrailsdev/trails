import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { TestHelper } from "@blazetrails/activejob/test-helper";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { stub, stubAnyInstance } from "@blazetrails/activesupport/testing/method-call-assertions";
import { silenceStream } from "@blazetrails/activesupport/testing/stream";
import { TestMailer, type Message } from "@blazetrails/mail";
import { TopLevel, constSet, include, stdout } from "@blazetrails/ruby-compat";
import { Base } from "../lib/base.js";
import { CallbackMailer } from "./support/mailers/callback-mailer.js";
import type { MessageDelivery } from "../lib/message-delivery.js";

type Mailer = typeof CallbackMailer & Record<string, (...args: unknown[]) => MessageDelivery>;
const Mailer = CallbackMailer as Mailer;
type Instance = { message: Message };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ActionMailerCallbacksTest extends TestCase {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
interface ActionMailerCallbacksTest extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {}
include(ActionMailerCallbacksTest, TestHelper);
constSet(TopLevel, "ActionMailerCallbacksTest", ActionMailerCallbacksTest);

type Ctx = { testCase: unknown };

function resetCallbackMailer() {
  CallbackMailer.rescueFromError = null;
  CallbackMailer.afterDeliverInstance = null;
  CallbackMailer.aroundDeliverInstance = null;
  CallbackMailer.abortBeforeDeliver = null;
  CallbackMailer.aroundHandlesError = null;
}

describe("ActionMailerCallbacksTest", () => {
  let previousDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    previousDeliveryMethod = Base.deliveryMethod;
    Base.deliveryMethod = "test";
    resetCallbackMailer();
  });

  afterEach(() => {
    Base.deliveries.length = 0;
    Base.deliveryMethod = previousDeliveryMethod;
    resetCallbackMailer();
  });

  it("deliver_now should call after_deliver callback and can access sent message", async () => {
    const mailDelivery = Mailer.testMessage();
    await mailDelivery.deliverNow();

    expect(CallbackMailer.afterDeliverInstance).toBeInstanceOf(CallbackMailer);
    const instance = CallbackMailer.afterDeliverInstance as Instance;
    expect(instance.message.messageId()).not.toBeEmpty();
    expect(instance.message.messageId()).toBe((await mailDelivery.message()).messageId());
    expect((instance.message.to() as string[])[0]).toBe("test-receiver@test.com");
  });

  it("deliver_now! should call after_deliver callback", async () => {
    await Mailer.testMessage().deliverNowBang();

    expect(CallbackMailer.afterDeliverInstance).toBeInstanceOf(CallbackMailer);
  });

  it("before_deliver can abort the delivery and not run after_deliver callbacks", async () => {
    CallbackMailer.abortBeforeDeliver = true;

    const mailDelivery = Mailer.testMessage();
    await mailDelivery.deliverNow();

    expect((await mailDelivery.message()).messageId()).toBeNull();
    expect(CallbackMailer.afterDeliverInstance).toBeNull();
  });

  it("deliver_later should call after_deliver callback and can access sent message", async ({
    testCase,
  }: Ctx) => {
    const t = testCase as TestHelper;
    await t.performEnqueuedJobs({}, async () => {
      await silenceStream(stdout, async () => {
        await Mailer.testMessage().deliverLater();
      });
    });
    expect(CallbackMailer.afterDeliverInstance).toBeInstanceOf(CallbackMailer);
    const instance = CallbackMailer.afterDeliverInstance as Instance;
    expect(instance.message.messageId()).not.toBeEmpty();
  });

  it("around_deliver is called after rescue_from on action processing exceptions", async () => {
    CallbackMailer.aroundHandlesError = true;

    await Mailer.testRaiseAction().deliverNow();
    expect(CallbackMailer.rescueFromError).toBeTruthy();
  });

  // BLOCKED: stub-any-instance-does-not-intercept-js-new
  it.skip("around_deliver is called before rescue_from on deliver! exceptions", async () => {
    CallbackMailer.aroundHandlesError = true;

    stubAnyInstance(TestMailer, { instance: new TestMailer({}) }, (instance) => {
      stub(instance, "deliverBang", () => {
        throw new Error("boom deliver exception");
      });
    });
    await Mailer.testMessage().deliverNow();

    expect(CallbackMailer.afterDeliverInstance).toBeInstanceOf(CallbackMailer);
    expect(CallbackMailer.rescueFromError).toBeNull();
  });
});
