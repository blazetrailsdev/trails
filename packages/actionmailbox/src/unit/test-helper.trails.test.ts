import { describe, expect, it } from "vitest";
import "../test-helpers/database/setup.js";
import "../inbound-email.js";
import { ApplicationMailbox } from "../test-helpers/mailboxes/application-mailbox.js";
import { TestCase } from "../test-case.js";

class TestHelperTest extends TestCase {}

describe("ActionMailbox::TestHelperTest", () => {
  it("receives a mail through the dummy app's ApplicationMailbox into MessagesMailbox", async () => {
    ApplicationMailbox.routing({ ":all": "messages" });
    const test = new TestHelperTest("receive");
    const inboundEmail = await test.receiveInboundEmailFromMail({
      to: "test@example.com",
      from: "hello@example.com",
      subject: "Hello",
    });
    expect(inboundEmail!.isDelivered()).toBe(true);
  });
});
