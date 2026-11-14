import { afterEach, beforeEach, describe, it } from "vitest";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { days } from "@blazetrails/activesupport";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { freezeTime, travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { include } from "@blazetrails/ruby-compat";
import "../../test-helper.js";
import { ActionMailbox } from "../../../lib/action-mailbox.js";
import { InboundEmail } from "../../../lib/inbound-email.js";
import { IncinerationJob } from "../../../lib/incineration-job.js";
import { TestCase } from "../../../lib/test-case.js";

class IncinerationTest extends TestCase {
  incineration(): void {}
}
include(IncinerationTest, ActiveJobTestHelper);

describe("ActionMailbox::InboundEmail::IncinerationTest", () => {
  let t: IncinerationTest & ActiveJobTestHelper;

  beforeEach(async () => {
    t = new IncinerationTest("incineration") as IncinerationTest & ActiveJobTestHelper;
    await t.beforeSetup();
  });

  afterEach(async () => {
    await t.afterTeardown();
    travelBack();
  });

  it("incinerating 30 days after delivery", async () => {
    freezeTime();

    await t.assertEnqueuedWith({ job: IncinerationJob, at: days(30).fromNow() }, async () => {
      await (await t.createInboundEmailFromFixture("welcome.eml"))!.deliveredBang();
    });

    travel(days(30));

    await assertDifference(
      () => InboundEmail.count(),
      -1,
      null,
      async () => {
        await t.performEnqueuedJobs({ only: IncinerationJob });
      },
    );
  });

  it("incinerating 30 days after bounce", async () => {
    freezeTime();

    await t.assertEnqueuedWith({ job: IncinerationJob, at: days(30).fromNow() }, async () => {
      await (await t.createInboundEmailFromFixture("welcome.eml"))!.bouncedBang();
    });

    travel(days(30));

    await assertDifference(
      () => InboundEmail.count(),
      -1,
      null,
      async () => {
        await t.performEnqueuedJobs({ only: IncinerationJob });
      },
    );
  });

  it("incinerating 30 days after failure", async () => {
    freezeTime();

    await t.assertEnqueuedWith({ job: IncinerationJob, at: days(30).fromNow() }, async () => {
      await (await t.createInboundEmailFromFixture("welcome.eml"))!.failedBang();
    });

    travel(days(30));

    await assertDifference(
      () => InboundEmail.count(),
      -1,
      null,
      async () => {
        await t.performEnqueuedJobs({ only: IncinerationJob });
      },
    );
  });

  it("skipping incineration", async () => {
    const original = ActionMailbox.incinerate;
    ActionMailbox.incinerate = false;
    try {
      await t.assertNoEnqueuedJobs({ only: IncinerationJob }, async () => {
        await (await t.createInboundEmailFromFixture("welcome.eml"))!.deliveredBang();
      });
    } finally {
      ActionMailbox.incinerate = original;
    }
  });
});
