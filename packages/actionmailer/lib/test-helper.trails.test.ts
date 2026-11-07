import { describe, it, type TestContext } from "vitest";
import type {} from "@blazetrails/activesupport/testing/autorun";
import { assertNothingRaised } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";

class BareMailer extends Base {
  async test() {
    return this.mail({ body: "Hello", to: "test@example.com", from: "tester@example.com" });
  }
}
constSet(TopLevel, "BareMailer", BareMailer);

class BareMailerTest extends TestCase {}
constSet(TopLevel, "BareMailerTest", BareMailerTest);

describe("BareMailerTest", () => {
  it("assert enqueued emails from a mailer that writes no class attribute", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as TestCase & TestHelper;
    const bareMailer = BareMailer as unknown as Record<
      string,
      () => { deliverLater(): Promise<unknown> }
    >;
    await assertNothingRaised(async () => {
      await t.assertEnqueuedEmails(1, () => bareMailer.test().deliverLater());
    });
  });
});
