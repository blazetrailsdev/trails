import { afterEach, beforeEach, describe, it } from "vitest";
import { TestCase as ActiveJobTestCase } from "@blazetrails/activejob/test-case";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import type { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { include } from "@blazetrails/ruby-compat";
import "../test-helpers/test-helper.js";
import type { InboundEmail } from "../inbound-email.js";
import { IncinerationJob } from "../incineration-job.js";
import { TestHelper } from "../test-helper.js";

class IncinerationJobTest extends ActiveJobTestCase {
  incinerationJob(): void {}
}
include(IncinerationJobTest, TestHelper);

describe("ActionMailbox::IncinerationJobTest", () => {
  let t: ActiveJobTestHelper;
  let helper: TestHelper;
  let inboundEmail: InboundEmail;

  beforeEach(async () => {
    const test = new IncinerationJobTest("incinerationJob");
    t = test as unknown as ActiveJobTestHelper;
    helper = test as unknown as TestHelper;
    await t.beforeSetup();
    inboundEmail = (await helper.createInboundEmailFromFixture("welcome.eml"))!;
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  it("ignoring a missing inbound email", async () => {
    await inboundEmail.destroyBang();

    await t.performEnqueuedJobs({}, async () => {
      await assertNothingRaised(async () => {
        await IncinerationJob.performLater(inboundEmail);
      });
    });
  });
});
