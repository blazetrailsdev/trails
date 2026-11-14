import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, block } from "@blazetrails/ruby-compat";
import "../../test-helper.js";
import "../../../lib/inbound-email.js";
import type { InboundEmail } from "../../../lib/inbound-email.js";
import { Base } from "../../../lib/base.js";
import { TestCase } from "../../../lib/test-case.js";

let $processed: unknown;

class SuccessfulMailbox extends Base {
  async process(): Promise<void> {
    $processed = (await this.mail()).subject();
  }
}

class UnsuccessfulMailbox extends Base {
  static {
    this.rescueFrom(
      RuntimeError,
      block(() => {
        $processed = "failure";
      }),
    );
  }

  process(): never {
    throw new RuntimeError("No way!");
  }
}

class BouncingMailbox extends Base {
  async process(): Promise<void> {
    $processed = "bounced";
    await this.bouncedBang();
  }
}

class StateTest extends TestCase {}

describe("ActionMailbox::Base::StateTest", () => {
  let inboundEmail: InboundEmail;

  beforeEach(async () => {
    $processed = false;
    inboundEmail = (await new StateTest("state").createInboundEmailFromMail({
      to: "replies@example.com",
      subject: "I was processed",
    }))!;
  });

  it("successful mailbox processing leaves inbound email in delivered state", async () => {
    await SuccessfulMailbox.receive(inboundEmail);
    expect(inboundEmail.isDelivered()).toBeTruthy();
    expect($processed).toBe("I was processed");
  });

  it("unsuccessful mailbox processing leaves inbound email in failed state", async () => {
    await UnsuccessfulMailbox.receive(inboundEmail);
    expect(inboundEmail.isFailed()).toBeTruthy();
    expect($processed).toBe("failure");
  });

  it("bounced inbound emails are not delivered", async () => {
    await BouncingMailbox.receive(inboundEmail);
    expect(inboundEmail.isBounced()).toBeTruthy();
    expect($processed).toBe("bounced");
  });
});
