import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { TopLevel, constSet, include } from "@blazetrails/ruby-compat";
import "../../test-helper.js";
import "../../../lib/inbound-email.js";
import { Base } from "../../../lib/base.js";
import { RoutingJob } from "../../../lib/routing-job.js";
import { TestCase } from "../../../lib/test-case.js";

let $processed: unknown;

class ApplicationMailbox extends Base {
  static {
    this.routing({ "replies@example.com": "replies" });
  }
}

class RepliesMailbox extends Base {
  async process(): Promise<void> {
    $processed = (await this.mail()).subject();
  }
}

constSet(TopLevel, "ApplicationMailbox", ApplicationMailbox);
constSet(TopLevel, "RepliesMailbox", RepliesMailbox);

class RoutingTest extends TestCase {
  routing(): void {}
}
include(RoutingTest, ActiveJobTestHelper);

describe("ActionMailbox::Base::RoutingTest", () => {
  let t: RoutingTest;
  let jobs: ActiveJobTestHelper;

  beforeEach(async () => {
    t = new RoutingTest("routing");
    jobs = t as unknown as ActiveJobTestHelper;
    await jobs.beforeSetup();
    $processed = false;
  });

  afterEach(async () => {
    await jobs.afterTeardown();
  });

  it("string routing", async () => {
    await ApplicationMailbox.route((await t.createInboundEmailFromFixture("welcome.eml"))!);
    expect($processed).toBe("Discussion: Let's debate these attachments");
  });

  it("delayed routing", async () => {
    await jobs.performEnqueuedJobs({ only: RoutingJob }, async () => {
      await t.createInboundEmailFromFixture("welcome.eml", { status: "pending" });
      expect($processed).toBe("Discussion: Let's debate these attachments");
    });
  });

  it("mailbox_for", async () => {
    const inboundEmail = (await t.createInboundEmailFromFixture("welcome.eml", {
      status: "pending",
    }))!;
    expect(await ApplicationMailbox.mailboxFor(inboundEmail)).toBe(RepliesMailbox);
  });
});
