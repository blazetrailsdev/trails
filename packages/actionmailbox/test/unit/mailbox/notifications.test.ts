import { describe, expect, it } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import "../../support/test-helper.js";
import "../../../lib/inbound-email.js";
import { Base } from "../../../lib/base.js";
import { TestCase } from "../../../lib/test-case.js";

class RepliesMailbox extends Base {}

class NotificationsTest extends TestCase {}

describe("ActionMailbox::Base::NotificationsTest", () => {
  it("instruments processing", async () => {
    const events: Array<{ name: string; payload: unknown }> = [];
    try {
      Notifications.subscribe("process.action_mailbox", (event) => {
        events.push(event);
      });

      const inboundEmail = (await new NotificationsTest(
        "instruments processing",
      ).createInboundEmailFromFixture("welcome.eml"))!;
      const mailbox = new RepliesMailbox(inboundEmail);
      await mailbox.performProcessing();

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("process.action_mailbox");
      expect(events[0].payload).toEqual({
        mailbox: mailbox,
        inboundEmail: {
          id: inboundEmail.id,
          messageId: "0CB459E0-0336-41DA-BC88-E6E28C697DDB@37signals.com",
          status: "processing",
        },
      });
    } finally {
      Notifications.unsubscribe("process.action_mailbox");
    }
  });
});
